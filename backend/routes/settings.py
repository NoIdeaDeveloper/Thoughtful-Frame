from fastapi import APIRouter, HTTPException
from backend.models import SettingsResponse, SettingsUpdate
from backend.database import get_db
import logging

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/settings", response_model=SettingsResponse)
async def get_settings():
    """Get current application settings"""
    logger.debug("Fetching application settings")
    
    db = await get_db()
    try:
        cursor = await db.execute("SELECT key, value FROM settings WHERE key IN ('auto_slide_gallery', 'theme', 'confetti_enabled')")
        rows = await cursor.fetchall()
        row_map = {r[0]: r[1] for r in rows}

        auto_slide_gallery = row_map["auto_slide_gallery"].lower() == "true" if "auto_slide_gallery" in row_map else True
        theme = row_map.get("theme", "dark")
        confetti_enabled = row_map["confetti_enabled"].lower() == "true" if "confetti_enabled" in row_map else True

        return SettingsResponse(auto_slide_gallery=auto_slide_gallery, theme=theme, confetti_enabled=confetti_enabled)
        
    except Exception as e:
        logger.error(f"Failed to fetch settings: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to fetch settings")
    finally:
        await db.close()


@router.put("/settings", response_model=SettingsResponse)
async def update_settings(settings: SettingsUpdate):
    """Update application settings"""
    logger.debug(f"Updating settings: {settings}")
    
    if not isinstance(settings.auto_slide_gallery, bool):
        raise HTTPException(status_code=400, detail="auto_slide_gallery must be a boolean value")
    if settings.theme not in ("dark", "light"):
        raise HTTPException(status_code=400, detail="theme must be 'dark' or 'light'")

    db = await get_db()
    try:
        await db.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
            ("auto_slide_gallery", str(settings.auto_slide_gallery)),
        )
        await db.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
            ("theme", settings.theme),
        )
        await db.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
            ("confetti_enabled", str(settings.confetti_enabled)),
        )
        await db.commit()

        return SettingsResponse(
            auto_slide_gallery=settings.auto_slide_gallery,
            theme=settings.theme,
            confetti_enabled=settings.confetti_enabled,
        )
        
    except Exception as e:
        logger.error(f"Failed to update settings: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to update settings")
    finally:
        await db.close()


@router.get("/stats", response_model=dict)
async def get_journal_stats():
    """Get journal statistics by month"""
    db = await get_db()
    try:
        # Query entries grouped by month
        cursor = await db.execute("""
            SELECT 
                strftime('%Y-%m', created_at) as month,
                COUNT(*) as count
            FROM journal_entries
            GROUP BY strftime('%Y-%m', created_at)
            ORDER BY created_at DESC
        """)
        
        rows = await cursor.fetchall()
        
        # Format response
        stats = {
            "by_month": [{"month": row[0], "count": row[1]} for row in rows],
            "total_entries": sum(row[1] for row in rows)
        }
        
        return stats
        
    finally:
        await db.close()