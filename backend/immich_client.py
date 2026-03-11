import httpx
from backend.config import IMMICH_BASE_URL, IMMICH_API_KEY

_client: httpx.AsyncClient | None = None


async def close():
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None


def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(
            base_url=IMMICH_BASE_URL,
            headers={"x-api-key": IMMICH_API_KEY},
            timeout=30.0,
        )
    return _client


async def get_assets(page: int = 1, page_size: int = 50) -> dict:
    client = _get_client()
    response = await client.post(
        "/search/metadata",
        json={
            "page": page,
            "size": page_size,
            "type": "IMAGE",
            "order": "desc",
        },
    )
    response.raise_for_status()
    return response.json()


async def get_asset(asset_id: str) -> dict:
    client = _get_client()
    response = await client.get(f"/assets/{asset_id}")
    response.raise_for_status()
    return response.json()


async def get_asset_thumbnail(asset_id: str) -> tuple[bytes, str]:
    client = _get_client()
    response = await client.get(f"/assets/{asset_id}/thumbnail")
    response.raise_for_status()
    content_type = response.headers.get("content-type", "image/jpeg")
    return response.content, content_type


async def get_asset_original(asset_id: str) -> tuple[bytes, str]:
    client = _get_client()
    response = await client.get(f"/assets/{asset_id}/original")
    response.raise_for_status()
    content_type = response.headers.get("content-type", "image/jpeg")
    return response.content, content_type
