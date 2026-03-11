from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
import httpx
import io
import logging
import os
import time
import hashlib
from pathlib import Path
from PIL import Image

from backend import immich_client

router = APIRouter()
logger = logging.getLogger(__name__)

# Cache configuration
CACHE_DIR = "/tmp/thoughtful_frame_cache"
CACHE_SIZE_LIMIT_MB = 500  # 500MB cache limit
CACHE_TTL_SECONDS = 86400  # 24 hours

# Ensure cache directory exists
Path(CACHE_DIR).mkdir(parents=True, exist_ok=True)


def get_cache_path(asset_id: str, is_thumbnail: bool = False) -> Path:
    """
    Get cache path for an asset
    """
    cache_type = "thumb" if is_thumbnail else "original"
    cache_filename = f"{asset_id}_{cache_type}.webp"
    return Path(CACHE_DIR) / cache_filename


def cleanup_cache_if_needed():
    """
    Clean up cache if it exceeds size limit
    """
    try:
        total_size = 0
        cache_files = []
        
        # Calculate total cache size
        for file in Path(CACHE_DIR).glob("*.webp"):
            try:
                total_size += file.stat().st_size
                cache_files.append((file, file.stat().st_mtime))
            except Exception:
                continue
        
        # Convert to MB
        total_size_mb = total_size / (1024 * 1024)
        
        if total_size_mb > CACHE_SIZE_LIMIT_MB:
            logger.warning(f"Cache size limit exceeded: {total_size_mb:.1f}MB > {CACHE_SIZE_LIMIT_MB}MB")
            
            # Sort by modification time (oldest first)
            cache_files.sort(key=lambda x: x[1])
            
            # Remove oldest files until we're under the limit
            for file, _ in cache_files:
                try:
                    file.unlink()
                    total_size -= file.stat().st_size
                    total_size_mb = total_size / (1024 * 1024)
                    
                    if total_size_mb <= CACHE_SIZE_LIMIT_MB * 0.9:  # Stop at 90% of limit
                        break
                except Exception:
                    continue
            
            logger.info(f"Cache cleaned up. New size: {total_size_mb:.1f}MB")
    
    except Exception as e:
        logger.error(f"Cache cleanup failed: {e}", exc_info=True)


def convert_to_webp(image_bytes: bytes, content_type: str) -> tuple[bytes, str]:
    """
    Convert any image format to WebP format.
    Returns tuple of (converted_bytes, content_type)
    """
    if not image_bytes or len(image_bytes) == 0:
        logger.error("Empty image data provided for conversion")
        raise ValueError("Empty image data")
    
    logger.debug(f"Converting {content_type} image of size {len(image_bytes)} bytes to WebP")
    
    try:
        # Open image with PIL
        image = Image.open(io.BytesIO(image_bytes))
        
        # Convert to RGB if needed (WebP requires RGB or RGBA)
        if image.mode in ('RGBA', 'LA', 'P'):
            # Keep alpha channel for transparency
            pass
        elif image.mode != 'RGB':
            image = image.convert('RGB')
        
        # Convert to WebP with high quality
        output = io.BytesIO()
        image.save(output, format="WEBP", quality=90, lossless=False)
        
        logger.info(f"Successfully converted {content_type} to WebP")
        return output.getvalue(), "image/webp"
        
    except Exception as e:
        logger.error(f"WebP conversion failed: {e}", exc_info=True)
        raise


def convert_heic_to_webp(image_bytes: bytes) -> tuple[bytes, str]:
    """
    Convert HEIC image data to WebP format.
    Returns tuple of (converted_bytes, content_type)
    """
    if not image_bytes or len(image_bytes) == 0:
        logger.error("Empty image data provided for HEIC conversion")
        raise ValueError("Empty image data")
    
    logger.debug(f"Attempting to convert HEIC image of size {len(image_bytes)} bytes to WebP")
    
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
        
        # Ensure RGB mode for WebP conversion
        if image.mode != 'RGB':
            image = image.convert('RGB')
        
        # Convert to WebP
        output = io.BytesIO()
        image.save(output, format="WEBP", quality=90, lossless=False)
        
        logger.info(f"Successfully converted HEIC to WebP using pyheif")
        return output.getvalue(), "image/webp"
        
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
        
        # Convert to WebP
        output = io.BytesIO()
        image.save(output, format="WEBP", quality=90, lossless=False)
        
        logger.info(f"Successfully converted HEIC to WebP using pillow-heif")
        return output.getvalue(), "image/webp"
        
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
        
        # Convert to WebP
        output = io.BytesIO()
        image.save(output, format="WEBP", quality=90, lossless=False)
        
        logger.info(f"Successfully converted HEIC to WebP using PIL")
        return output.getvalue(), "image/webp"
        
    except Exception as e:
        logger.error(f"PIL direct conversion failed: {e}")
        conversion_errors.append(f"PIL error: {str(e)}")
    
    # If all methods failed
    error_msg = "All HEIC conversion methods failed: " + ", ".join(conversion_errors)
    logger.error(error_msg)
    raise RuntimeError(error_msg)


def convert_dng_to_webp(image_bytes: bytes) -> tuple[bytes, str]:
    """
    Convert DNG (RAW) image data to WebP format.
    Returns tuple of (converted_bytes, content_type)
    """
    if not image_bytes or len(image_bytes) == 0:
        logger.error("Empty image data provided for DNG conversion")
        raise ValueError("Empty image data")
    
    logger.debug(f"Attempting to convert DNG image of size {len(image_bytes)} bytes to WebP")
    
    try:
        # Try using rawpy for DNG conversion
        try:
            import rawpy
            
            with rawpy.imread(io.BytesIO(image_bytes)) as raw:
                # Process the RAW image
                rgb = raw.postprocess()
                
                # Convert to PIL Image
                image = Image.fromarray(rgb)
                
                # Convert to WebP
                output = io.BytesIO()
                image.save(output, format="WEBP", quality=90, lossless=False)
                
                logger.info(f"Successfully converted DNG to WebP using rawpy")
                return output.getvalue(), "image/webp"
                
        except ImportError:
            logger.warning("rawpy not available for DNG conversion")
            raise RuntimeError("DNG conversion requires rawpy library")
        
    except Exception as e:
        logger.error(f"DNG conversion failed: {e}", exc_info=True)
        raise
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


async def get_cached_or_convert_image(asset_id: str, is_thumbnail: bool = False) -> tuple[bytes, str]:
    """
    Get image from cache or convert and cache it.
    Converts HEIC, DNG, and other formats to WebP for better compatibility and performance.
    """
    try:
        # Check cache first
        cache_path = get_cache_path(asset_id, is_thumbnail)
        
        if cache_path.exists():
            # Check cache age
            cache_age = time.time() - cache_path.stat().st_mtime
            
            if cache_age < CACHE_TTL_SECONDS:
                logger.debug(f"Cache hit for asset {asset_id} (age: {cache_age:.1f}s)")
                try:
                    with open(cache_path, "rb") as f:
                        return f.read(), "image/webp"
                except Exception as cache_read_error:
                    logger.error(f"Failed to read cache for asset {asset_id}: {cache_read_error}")
                    # Continue to fetch fresh copy
            else:
                logger.debug(f"Cache expired for asset {asset_id} (age: {cache_age:.1f}s)")
                # Continue to fetch fresh copy
        
        # Fetch from Immich
        if is_thumbnail:
            image_bytes, content_type = await immich_client.get_asset_thumbnail(asset_id)
        else:
            image_bytes, content_type = await immich_client.get_asset_original(asset_id)
        
        logger.debug(f"Fetched asset {asset_id}, content-type: {content_type}, size: {len(image_bytes)} bytes")
        
        # Clean up cache if needed before adding new files
        cleanup_cache_if_needed()
        
        # Convert to WebP based on content type
        try:
            if content_type and content_type.lower() == 'image/heic':
                logger.info(f"Detected HEIC image for asset {asset_id}, converting to WebP")
                converted_bytes, converted_type = convert_heic_to_webp(image_bytes)
            elif content_type and content_type.lower() == 'image/dng':
                logger.info(f"Detected DNG image for asset {asset_id}, converting to WebP")
                converted_bytes, converted_type = convert_dng_to_webp(image_bytes)
            elif content_type and (content_type.lower().startswith('image/') or 
                                 content_type.lower() == 'application/octet-stream'):
                logger.info(f"Converting {content_type} to WebP for asset {asset_id}")
                converted_bytes, converted_type = convert_to_webp(image_bytes, content_type)
            else:
                logger.debug(f"Asset {asset_id} is not a convertible image ({content_type}), passing through unchanged")
                # Write original to cache if it's already WebP or we can't convert
                with open(cache_path, "wb") as f:
                    f.write(image_bytes)
                return image_bytes, content_type
            
            # Cache the converted image
            with open(cache_path, "wb") as f:
                f.write(converted_bytes)
            
            logger.info(f"Successfully converted and cached {content_type} to {converted_type} for asset {asset_id}")
            logger.debug(f"Original size: {len(image_bytes)} bytes, Converted size: {len(converted_bytes)} bytes")
            return converted_bytes, converted_type
            
        except Exception as e:
            logger.error(f"Conversion failed for asset {asset_id}: {e}", exc_info=True)
            logger.warning(f"Falling back to original data for asset {asset_id}")
            
            # Cache the original as fallback
            with open(cache_path, "wb") as f:
                f.write(image_bytes)
            
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
    image_bytes, content_type = await get_cached_or_convert_image(asset_id, is_thumbnail=True)
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
    image_bytes, content_type = await get_cached_or_convert_image(asset_id, is_thumbnail=False)
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
        
        # Try to convert (test all formats)
        try:
            if content_type.lower() == 'image/heic':
                converted_bytes, converted_type = convert_heic_to_webp(image_bytes)
            elif content_type.lower() == 'image/dng':
                converted_bytes, converted_type = convert_dng_to_webp(image_bytes)
            else:
                converted_bytes, converted_type = convert_to_webp(image_bytes, content_type)
            
            return {
                "asset_id": asset_id,
                "original_size": len(image_bytes),
                "converted_size": len(converted_bytes),
                "original_type": content_type,
                "converted_type": converted_type,
                "success": True,
                "message": "Conversion successful"
            }
        except Exception as e:
            return {
                "asset_id": asset_id,
                "error": str(e),
                "success": False,
                "message": "Conversion failed"
            }
        
    except Exception as e:
        logger.error(f"Conversion test failed for asset {asset_id}: {e}", exc_info=True)
        return {
            "asset_id": asset_id,
            "error": str(e),
            "success": False,
            "message": "Failed to test conversion"
        }


@router.get("/debug/cache-stats")
async def get_cache_statistics():
    """
    Get statistics about the image cache
    """
    try:
        cache_files = list(Path(CACHE_DIR).glob("*.webp"))
        
        total_files = len(cache_files)
        total_size = sum(f.stat().st_size for f in cache_files)
        total_size_mb = total_size / (1024 * 1024)
        
        # Get age distribution
        now = time.time()
        ages = [now - f.stat().st_mtime for f in cache_files]
        avg_age = sum(ages) / len(ages) if ages else 0
        
        return {
            "cache_stats": {
                "total_files": total_files,
                "total_size_mb": round(total_size_mb, 2),
                "average_age_seconds": round(avg_age, 1),
                "max_size_mb": CACHE_SIZE_LIMIT_MB,
                "ttl_seconds": CACHE_TTL_SECONDS
            },
            "status": "ok"
        }
        
    except Exception as e:
        logger.error(f"Cache stats failed: {e}", exc_info=True)
        return {
            "error": str(e),
            "status": "error"
        }


@router.delete("/debug/cache-clear")
async def clear_cache():
    """
    Clear the entire image cache
    """
    try:
        cache_files = list(Path(CACHE_DIR).glob("*.webp"))
        
        for file in cache_files:
            try:
                file.unlink()
            except Exception as e:
                logger.error(f"Failed to delete cache file {file}: {e}")
        
        remaining_files = list(Path(CACHE_DIR).glob("*.webp"))
        cleared_count = len(cache_files) - len(remaining_files)
        
        return {
            "message": f"Cache cleared successfully",
            "files_cleared": cleared_count,
            "files_remaining": len(remaining_files),
            "status": "ok"
        }
        
    except Exception as e:
        logger.error(f"Cache clearing failed: {e}", exc_info=True)
        return {
            "error": str(e),
            "status": "error"
        }
