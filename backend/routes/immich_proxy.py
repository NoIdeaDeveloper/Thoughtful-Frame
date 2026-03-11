from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
import httpx
from backend import immich_client
import io
import logging
from PIL import Image
import tempfile
import os

router = APIRouter()
logger = logging.getLogger(__name__)


def convert_heic_to_jpeg(image_bytes: bytes) -> tuple[bytes, str]:
    """
    Convert HEIC image data to JPEG format.
    Returns tuple of (converted_bytes, content_type)
    """
    if not image_bytes or len(image_bytes) == 0:
        logger.error("Empty image data provided for HEIC conversion")
        raise ValueError("Empty image data")
    
    logger.debug(f"Attempting to convert HEIC image of size {len(image_bytes)} bytes")
    
    # Try multiple conversion methods
    conversion_errors = []
    
    # Method 1: Try pyheif (most reliable for HEIC)
    try:
        import pyheif
        from pyheif import HeifFile
        
        logger.debug("Attempting HEIC conversion using pyheif")
        heif_file = pyheif.read_heif(io.BytesIO(image_bytes))
        
        # Create PIL Image from HEIC data
        image = Image.frombytes(
            heif_file.mode,
            heif_file.size,
            heif_file.data,
            "raw",
            heif_file.mode,
            heif_file.stride,
        )
        
        # Ensure RGB mode for JPEG conversion
        if image.mode != 'RGB':
            image = image.convert('RGB')
        
        # Convert to JPEG
        output = io.BytesIO()
        image.save(output, format="JPEG", quality=90, optimize=True)
        
        logger.info(f"Successfully converted HEIC to JPEG using pyheif")
        return output.getvalue(), "image/jpeg"
        
    except ImportError as e:
        logger.warning(f"pyheif not available: {e}")
        conversion_errors.append("pyheif not installed")
    except Exception as e:
        logger.warning(f"pyheif conversion failed: {e}")
        conversion_errors.append(f"pyheif error: {str(e)}")
    
    # Method 2: Try pillow-heif
    try:
        from pillow_heif import register_heif_opener
        register_heif_opener()
        
        logger.debug("Attempting HEIC conversion using pillow-heif")
        image = Image.open(io.BytesIO(image_bytes))
        
        # Ensure RGB mode
        if image.mode != 'RGB':
            image = image.convert('RGB')
        
        # Convert to JPEG
        output = io.BytesIO()
        image.save(output, format="JPEG", quality=90, optimize=True)
        
        logger.info(f"Successfully converted HEIC to JPEG using pillow-heif")
        return output.getvalue(), "image/jpeg"
        
    except ImportError:
        logger.warning("pillow-heif not available")
        conversion_errors.append("pillow-heif not installed")
    except Exception as e:
        logger.warning(f"pillow-heif conversion failed: {e}")
        conversion_errors.append(f"pillow-heif error: {str(e)}")
    
    # Method 3: Try direct PIL (may work for some HEIC variants)
    try:
        logger.debug("Attempting HEIC conversion using PIL directly")
        image = Image.open(io.BytesIO(image_bytes))
        
        # Ensure RGB mode
        if image.mode != 'RGB':
            image = image.convert('RGB')
        
        # Save as JPEG
        output = io.BytesIO()
        image.save(output, format="JPEG", quality=90, optimize=True)
        
        logger.info(f"Successfully converted HEIC to JPEG using PIL")
        return output.getvalue(), "image/jpeg"
        
    except Exception as e:
        logger.error(f"PIL direct conversion failed: {e}")
        conversion_errors.append(f"PIL error: {str(e)}")
    
    # If all methods failed
    error_msg = "All HEIC conversion methods failed: " + ", ".join(conversion_errors)
    logger.error(error_msg)
    raise RuntimeError(error_msg)


async def _get_image_with_heic_fallback(asset_id: str, is_thumbnail: bool = False) -> tuple[bytes, str]:
    """
    Get image from Immich with automatic HEIC to JPEG conversion.
    """
    try:
        if is_thumbnail:
            image_bytes, content_type = await immich_client.get_asset_thumbnail(asset_id)
        else:
            image_bytes, content_type = await immich_client.get_asset_original(asset_id)
        
        logger.debug(f"Fetched asset {asset_id}, content-type: {content_type}, size: {len(image_bytes)} bytes")
        
        # Convert HEIC to JPEG for better browser compatibility
        if content_type and content_type.lower() == 'image/heic':
            logger.info(f"Detected HEIC image for asset {asset_id}, attempting conversion")
            try:
                converted_bytes, converted_type = convert_heic_to_jpeg(image_bytes)
                logger.info(f"Successfully converted HEIC to {converted_type} for asset {asset_id}")
                logger.debug(f"Original size: {len(image_bytes)} bytes, Converted size: {len(converted_bytes)} bytes")
                return converted_bytes, converted_type
            except Exception as e:
                logger.error(f"HEIC conversion failed for asset {asset_id}: {e}", exc_info=True)
                logger.warning(f"Falling back to original HEIC data for asset {asset_id}")
                # If conversion fails, try to force JPEG by requesting thumbnail instead
                if not is_thumbnail:
                    logger.info(f"Falling back to thumbnail for asset {asset_id} due to HEIC conversion failure")
                    try:
                        thumbnail_bytes, thumbnail_type = await immich_client.get_asset_thumbnail(asset_id)
                        logger.warning(f"Returning thumbnail instead of original for asset {asset_id}")
                        return thumbnail_bytes, thumbnail_type
                    except Exception as thumbnail_error:
                        logger.error(f"Failed to get thumbnail fallback for asset {asset_id}: {thumbnail_error}")
                return image_bytes, content_type
        else:
            logger.debug(f"Asset {asset_id} is not HEIC ({content_type}), passing through unchanged")
        
        return image_bytes, content_type
        
    except httpx.ConnectError:
        raise HTTPException(
            status_code=502,
            detail="Cannot reach Immich server. Check IMMICH_BASE_URL.",
        )
    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=e.response.status_code,
            detail=f"Immich returned an error: {e.response.status_code}",
        )
    except Exception as e:
        logger.error(f"Unexpected error fetching image for asset {asset_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch image: {str(e)}",
        )


@router.get("/assets")
async def list_assets(page: int = 1, page_size: int = 50):
    try:
        data = await immich_client.get_assets(page, page_size)
        return data
    except httpx.ConnectError:
        raise HTTPException(
            status_code=502,
            detail="Cannot reach Immich server. Check IMMICH_BASE_URL.",
        )
    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=e.response.status_code,
            detail=f"Immich returned an error: {e.response.status_code}",
        )


@router.get("/assets/{asset_id}")
async def get_asset_detail(asset_id: str):
    try:
        data = await immich_client.get_asset(asset_id)
        return data
    except httpx.ConnectError:
        raise HTTPException(
            status_code=502,
            detail="Cannot reach Immich server. Check IMMICH_BASE_URL.",
        )
    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=e.response.status_code,
            detail=f"Immich returned an error: {e.response.status_code}",
        )


@router.get("/assets/{asset_id}/thumbnail")
async def get_thumbnail(asset_id: str):
    image_bytes, content_type = await _get_image_with_heic_fallback(asset_id, is_thumbnail=True)
    return Response(
        content=image_bytes,
        media_type=content_type,
        headers={
            "Cache-Control": "public, max-age=86400",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET",
            "Access-Control-Allow-Headers": "Content-Type"
        },
    )


@router.get("/assets/{asset_id}/original")
async def get_original(asset_id: str):
    image_bytes, content_type = await _get_image_with_heic_fallback(asset_id, is_thumbnail=False)
    return Response(
        content=image_bytes,
        media_type=content_type,
        headers={
            "Cache-Control": "public, max-age=86400",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET",
            "Access-Control-Allow-Headers": "Content-Type"
        },
    )


@router.get("/debug/heic-test")
async def test_heic_conversion():
    """
    Debug endpoint to test HEIC conversion functionality
    """
    try:
        # Test if pyheif is available
        try:
            import pyheif
            pyheif_available = True
            pyheif_version = getattr(pyheif, '__version__', 'unknown')
        except ImportError:
            pyheif_available = False
            pyheif_version = "not installed"
        
        # Test if pillow-heif is available
        try:
            import pillow_heif
            pillow_heif_available = True
            pillow_heif_version = getattr(pillow_heif, '__version__', 'unknown')
        except ImportError:
            pillow_heif_available = False
            pillow_heif_version = "not installed"
        
        # Test PIL availability
        pil_available = True
        pil_version = "unknown"
        try:
            from PIL import Image
            pil_version = getattr(Image, '__version__', 'unknown')
        except ImportError:
            pil_available = False
        
        return {
            "heic_support": {
                "pyheif": {
                    "available": pyheif_available,
                    "version": pyheif_version
                },
                "pillow_heif": {
                    "available": pillow_heif_available,
                    "version": pillow_heif_version
                },
                "pil": {
                    "available": pil_available,
                    "version": pil_version
                }
            },
            "status": "ok" if (pyheif_available or pillow_heif_available) else "limited",
            "message": "HEIC conversion ready" if (pyheif_available or pillow_heif_available) else "HEIC conversion available with limitations"
        }
        
    except Exception as e:
        logger.error(f"HEIC test endpoint failed: {e}", exc_info=True)
        return {
            "error": str(e),
            "status": "error"
        }


@router.get("/debug/convert-test")
async def test_heic_conversion_with_asset(asset_id: str):
    """
    Test HEIC conversion with a specific asset
    """
    try:
        # Fetch the original image
        image_bytes, content_type = await immich_client.get_asset_original(asset_id)
        
        if content_type.lower() != 'image/heic':
            return {
                "asset_id": asset_id,
                "content_type": content_type,
                "is_heic": False,
                "message": "Asset is not HEIC format"
            }
        
        # Try to convert
        try:
            converted_bytes, converted_type = convert_heic_to_jpeg(image_bytes)
            return {
                "asset_id": asset_id,
                "original_size": len(image_bytes),
                "converted_size": len(converted_bytes),
                "original_type": content_type,
                "converted_type": converted_type,
                "success": True,
                "message": "HEIC conversion successful"
            }
        except Exception as e:
            return {
                "asset_id": asset_id,
                "error": str(e),
                "success": False,
                "message": "HEIC conversion failed"
            }
        
    except Exception as e:
        logger.error(f"HEIC conversion test failed for asset {asset_id}: {e}", exc_info=True)
        return {
            "asset_id": asset_id,
            "error": str(e),
            "success": False,
            "message": "Failed to test HEIC conversion"
        }
