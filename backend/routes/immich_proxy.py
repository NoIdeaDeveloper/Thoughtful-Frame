from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
import httpx
from backend import immich_client

router = APIRouter()


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
    try:
        image_bytes, content_type = await immich_client.get_asset_thumbnail(asset_id)
        return Response(
            content=image_bytes,
            media_type=content_type,
            headers={"Cache-Control": "public, max-age=86400"},
        )
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


@router.get("/assets/{asset_id}/original")
async def get_original(asset_id: str):
    try:
        image_bytes, content_type = await immich_client.get_asset_original(asset_id)
        return Response(
            content=image_bytes,
            media_type=content_type,
            headers={"Cache-Control": "public, max-age=86400"},
        )
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
