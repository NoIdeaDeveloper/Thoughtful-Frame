import sqlite3
import aiosqlite
from backend.config import DATABASE_PATH

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


async def init_db():
    db = get_db()
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
    await db.execute("""
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
    """)
    # Migrations: add columns to existing databases
    try:
        await db.execute("ALTER TABLE journal_entries ADD COLUMN summary TEXT NOT NULL DEFAULT ''")
        await db.commit()
    except sqlite3.OperationalError:
        pass  # Column already exists

    await db.commit()
