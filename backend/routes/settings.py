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
        # Get auto_slide_gallery setting (default to True if not set)
        cursor = await db.execute("SELECT value FROM settings WHERE key = 'auto_slide_gallery'")
        result = await cursor.fetchone()
        
        if result:
            auto_slide_gallery = result[0].lower() == 'true'
        else:
            auto_slide_gallery = True  # Default value
            
        return SettingsResponse(auto_slide_gallery=auto_slide_gallery)
        
    except Exception as e:
        logger.error(f"Failed to fetch settings: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to fetch settings")
    finally:
        await db.close()


@router.put("/settings", response_model=SettingsResponse)
async def update_settings(settings: SettingsUpdate):
    """Update application settings"""
    logger.debug(f"Updating settings: {settings}")
    
    # Validate that auto_slide_gallery is a boolean
    if not isinstance(settings.auto_slide_gallery, bool):
        logger.warning(f"Invalid settings data type: auto_slide_gallery must be boolean, got {type(settings.auto_slide_gallery)}")
        raise HTTPException(status_code=400, detail="auto_slide_gallery must be a boolean value")
    
    db = await get_db()
    try:
        await db.execute(
            """
            INSERT OR REPLACE INTO settings (key, value)
            VALUES (?, ?)
            """,
            ("auto_slide_gallery", str(settings.auto_slide_gallery))
        )
        await db.commit()
        
        return SettingsResponse(auto_slide_gallery=settings.auto_slide_gallery)
        
    except Exception as e:
        logger.error(f"Failed to update settings: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to update settings")
    finally:
        await db.close()