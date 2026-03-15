import logging
import aiosqlite
from backend.config import DATABASE_PATH

logger = logging.getLogger(__name__)

_db: aiosqlite.Connection | None = None


async def open_db():
    """Open a persistent database connection at startup."""
    global _db
    _db = await aiosqlite.connect(DATABASE_PATH, timeout=10.0)
    _db.row_factory = aiosqlite.Row
    await _db.execute("PRAGMA journal_mode=WAL")
    await _db.execute("PRAGMA foreign_keys=ON")


async def close_db():
    """Close the persistent database connection at shutdown."""
    global _db
    if _db is not None:
        await _db.close()
        _db = None


def get_db() -> aiosqlite.Connection:
    """Get the persistent database connection."""
    if _db is None:
        raise RuntimeError("Database connection not initialized. Call open_db() first.")
    return _db


# ---------------------------------------------------------------------------
# Schema baseline — always created on first run via CREATE TABLE IF NOT EXISTS
# ---------------------------------------------------------------------------

async def _create_baseline(db: aiosqlite.Connection) -> None:
    await db.execute("""
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
    """)
    await db.execute("""
        CREATE TABLE IF NOT EXISTS journal_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL DEFAULT '',
            summary TEXT NOT NULL DEFAULT '',
            body TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
    """)
    await db.execute("""
        CREATE TABLE IF NOT EXISTS entry_assets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            entry_id INTEGER NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
            immich_asset_id TEXT NOT NULL,
            position INTEGER NOT NULL DEFAULT 0,
            UNIQUE(entry_id, immich_asset_id)
        )
    """)
    await db.execute("""
        CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            expires_at REAL NOT NULL
        )
    """)
    await db.execute("""
        CREATE INDEX IF NOT EXISTS idx_entries_created_at
        ON journal_entries(created_at DESC)
    """)
    await db.execute("""
        CREATE INDEX IF NOT EXISTS idx_entry_assets_entry_id
        ON entry_assets(entry_id)
    """)
    await db.execute("""
        CREATE INDEX IF NOT EXISTS idx_entry_assets_asset_id
        ON entry_assets(immich_asset_id)
    """)
    await db.commit()


# ---------------------------------------------------------------------------
# Versioned migrations — each entry runs exactly once, in order.
# Add new migrations to the END of this list only.
# ---------------------------------------------------------------------------

async def _m001_add_summary(db: aiosqlite.Connection) -> None:
    await db.execute("ALTER TABLE journal_entries ADD COLUMN summary TEXT NOT NULL DEFAULT ''")


async def _m002_add_tags(db: aiosqlite.Connection) -> None:
    await db.execute("ALTER TABLE journal_entries ADD COLUMN tags TEXT NOT NULL DEFAULT ''")


MIGRATIONS: list[tuple[int, str, object]] = [
    (1, "add summary column", _m001_add_summary),
    (2, "add tags column", _m002_add_tags),
]


async def _get_schema_version(db: aiosqlite.Connection) -> int:
    cursor = await db.execute("SELECT value FROM settings WHERE key = 'schema_version'")
    row = await cursor.fetchone()
    return int(row["value"]) if row else 0


async def _set_schema_version(db: aiosqlite.Connection, version: int) -> None:
    await db.execute(
        "INSERT INTO settings (key, value) VALUES ('schema_version', ?) "
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (str(version),),
    )
    await db.commit()


async def _run_migrations(db: aiosqlite.Connection) -> None:
    current = await _get_schema_version(db)
    for version, description, migration_fn in MIGRATIONS:
        if version <= current:
            continue
        logger.info(f"Running migration {version}: {description}")
        try:
            await migration_fn(db)
            await db.commit()
            await _set_schema_version(db, version)
            logger.info(f"Migration {version} complete")
        except Exception as e:
            await db.rollback()
            # If the column already exists (fresh DB where baseline already has it),
            # just advance the version and continue.
            if "duplicate column" in str(e).lower() or "already exists" in str(e).lower():
                logger.debug(f"Migration {version} skipped (already applied): {e}")
                await _set_schema_version(db, version)
            else:
                logger.error(f"Migration {version} failed: {e}", exc_info=True)
                raise


async def init_db():
    db = get_db()
    await _create_baseline(db)
    await _run_migrations(db)
