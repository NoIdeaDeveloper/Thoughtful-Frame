from pydantic import BaseModel
from typing import Optional


class EntryCreate(BaseModel):
    immich_asset_ids: list[str]
    title: str = ""
    body: str


class EntryUpdate(BaseModel):
    title: Optional[str] = None
    body: Optional[str] = None
    immich_asset_ids: Optional[list[str]] = None


class EntryResponse(BaseModel):
    id: int
    immich_asset_ids: list[str]
    title: str
    body: str
    created_at: str
    updated_at: str


class EntryListResponse(BaseModel):
    entries: list[EntryResponse]
    total: int
    page: int
    page_size: int


class AssetIdsRequest(BaseModel):
    asset_ids: list[str]


class AssetIdsWithEntriesResponse(BaseModel):
    asset_ids_with_entries: list[str]


class SettingsResponse(BaseModel):
    auto_slide_gallery: bool = True


class SettingsUpdate(BaseModel):
    auto_slide_gallery: bool
