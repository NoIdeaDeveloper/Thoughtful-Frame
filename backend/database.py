import aiosqlite
from backend.config import DATABASE_PATH


async def get_db() -> aiosqlite.Connection:
    db = await aiosqlite.connect(DATABASE_PATH, timeout=10.0)
    db.row_factory = aiosqlite.Row
    await db.execute("PRAGMA journal_mode=WAL")
    await db.execute("PRAGMA foreign_keys=ON")
    return db


async def init_db():
    db = await get_db()
    try:
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
        except Exception:
            pass  # Column already exists

        await db.commit()
    finally:
        await db.close()
