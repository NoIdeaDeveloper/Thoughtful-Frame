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
    try:
        # Try to detect and convert HEIC using pyheif if available
        try:
            import pyheif
            from pyheif import HeifFile
            
            # Convert HEIC to JPEG using pyheif
            heif_file = pyheif.read_heif(io.BytesIO(image_bytes))
            image = Image.frombytes(
                heif_file.mode,
                heif_file.size,
                heif_file.data,
                "raw",
                heif_file.mode,
                heif_file.stride,
            )
            
            # Convert to JPEG
            output = io.BytesIO()
            image.save(output, format="JPEG", quality=90)
            return output.getvalue(), "image/jpeg"
            
        except ImportError:
            logger.warning("pyheif not available, trying PIL-based conversion")
            
        except Exception as e:
            logger.warning(f"pyheif conversion failed: {e}, trying PIL-based conversion")
        
        # Fallback: Try PIL directly (may work for some HEIC variants)
        try:
            image = Image.open(io.BytesIO(image_bytes))
            
            # Convert to RGB if needed (HEIC might be in different color modes)
            if image.mode != 'RGB':
                image = image.convert('RGB')
            
            # Save as JPEG
            output = io.BytesIO()
            image.save(output, format="JPEG", quality=90)
            return output.getvalue(), "image/jpeg"
            
        except Exception as e:
            logger.error(f"Failed to convert HEIC image: {e}")
            raise
            
    except Exception as e:
        logger.error(f"HEIC conversion error: {e}")
        raise


async def _get_image_with_heic_fallback(asset_id: str, is_thumbnail: bool = False) -> tuple[bytes, str]:
    """
    Get image from Immich with automatic HEIC to JPEG conversion.
    """
    try:
        if is_thumbnail:
            image_bytes, content_type = await immich_client.get_asset_thumbnail(asset_id)
        else:
            image_bytes, content_type = await immich_client.get_asset_original(asset_id)
        
        # Convert HEIC to JPEG for better browser compatibility
        if content_type.lower() == 'image/heic':
            logger.info(f"Converting HEIC to JPEG for asset {asset_id}")
            try:
                converted_bytes, converted_type = convert_heic_to_jpeg(image_bytes)
                logger.debug(f"Successfully converted HEIC to {converted_type}")
                return converted_bytes, converted_type
            except Exception as e:
                logger.error(f"HEIC conversion failed for asset {asset_id}: {e}")
                # Fall back to original HEIC data
                return image_bytes, content_type
        
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
