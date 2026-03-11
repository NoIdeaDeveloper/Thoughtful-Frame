from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from backend.database import get_db
from backend.models import (
    EntryCreate,
    EntryUpdate,
    EntryResponse,
    EntryListResponse,
    AssetIdsRequest,
    AssetIdsWithEntriesResponse,
)

router = APIRouter()


async def _build_entry_response(db, entry_row) -> EntryResponse:
    cursor = await db.execute(
        "SELECT immich_asset_id FROM entry_assets WHERE entry_id = ? ORDER BY position",
        (entry_row["id"],),
    )
    asset_rows = await cursor.fetchall()
    return EntryResponse(
        id=entry_row["id"],
        immich_asset_ids=[r["immich_asset_id"] for r in asset_rows],
        title=entry_row["title"],
        body=entry_row["body"],
        created_at=entry_row["created_at"],
        updated_at=entry_row["updated_at"],
    )


async def _build_entries_response(db, entry_rows) -> list[EntryResponse]:
    if not entry_rows:
        return []
    entry_ids = [r["id"] for r in entry_rows]
    
    # Safe parameterized query - build IN clause with proper placeholders
    placeholders = ",".join("?" for _ in entry_ids)
    query = f"SELECT entry_id, immich_asset_id FROM entry_assets WHERE entry_id IN ({placeholders}) ORDER BY entry_id, position"
    cursor = await db.execute(query, entry_ids)
    asset_rows = await cursor.fetchall()
    
    assets_by_entry = {}
    for row in asset_rows:
        assets_by_entry.setdefault(row["entry_id"], []).append(row["immich_asset_id"])
    return [
        EntryResponse(
            id=r["id"],
            immich_asset_ids=assets_by_entry.get(r["id"], []),
            title=r["title"],
            body=r["body"],
            created_at=r["created_at"],
            updated_at=r["updated_at"],
        )
        for r in entry_rows
    ]


@router.get("/entries", response_model=EntryListResponse)
async def list_entries(page: int = 1, page_size: int = 20):
    db = await get_db()
    try:
        offset = (page - 1) * page_size

        cursor = await db.execute("SELECT COUNT(*) as cnt FROM journal_entries")
        row = await cursor.fetchone()
        total = row["cnt"]

        cursor = await db.execute(
            "SELECT * FROM journal_entries ORDER BY created_at DESC LIMIT ? OFFSET ?",
            (page_size, offset),
        )
        entries = await cursor.fetchall()

        result = await _build_entries_response(db, entries)

        return EntryListResponse(
            entries=result, total=total, page=page, page_size=page_size
        )
    finally:
        await db.close()


@router.get("/entries/{entry_id}", response_model=EntryResponse)
async def get_entry(entry_id: int):
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT * FROM journal_entries WHERE id = ?", (entry_id,)
        )
        entry = await cursor.fetchone()
        if not entry:
            raise HTTPException(status_code=404, detail="Entry not found")
        return await _build_entry_response(db, entry)
    finally:
        await db.close()


@router.post("/entries", response_model=EntryResponse, status_code=201)
async def create_entry(data: EntryCreate):
    if not data.immich_asset_ids:
        raise HTTPException(status_code=400, detail="At least one asset ID is required")

    now = datetime.now(timezone.utc).isoformat()
    db = await get_db()
    try:
        async with db:
            cursor = await db.execute(
                "INSERT INTO journal_entries (title, body, created_at, updated_at) VALUES (?, ?, ?, ?)",
                (data.title, data.body, now, now),
            )
            entry_id = cursor.lastrowid

            for position, asset_id in enumerate(data.immich_asset_ids):
                await db.execute(
                    "INSERT INTO entry_assets (entry_id, immich_asset_id, position) VALUES (?, ?, ?)",
                    (entry_id, asset_id, position),
                )

        cursor = await db.execute(
            "SELECT * FROM journal_entries WHERE id = ?", (entry_id,)
        )
        entry = await cursor.fetchone()
        return await _build_entry_response(db, entry)
    finally:
        await db.close()


@router.put("/entries/{entry_id}", response_model=EntryResponse)
async def update_entry(entry_id: int, data: EntryUpdate):
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT * FROM journal_entries WHERE id = ?", (entry_id,)
        )
        entry = await cursor.fetchone()
        if not entry:
            raise HTTPException(status_code=404, detail="Entry not found")

        now = datetime.now(timezone.utc).isoformat()
        new_title = data.title if data.title is not None else entry["title"]
        new_body = data.body if data.body is not None else entry["body"]

        await db.execute(
            "UPDATE journal_entries SET title = ?, body = ?, updated_at = ? WHERE id = ?",
            (new_title, new_body, now, entry_id),
        )

        if data.immich_asset_ids is not None:
            if not data.immich_asset_ids:
                raise HTTPException(
                    status_code=400, detail="At least one asset ID is required"
                )
            async with db:
                await db.execute(
                    "DELETE FROM entry_assets WHERE entry_id = ?", (entry_id,)
                )
                for position, asset_id in enumerate(data.immich_asset_ids):
                    await db.execute(
                        "INSERT INTO entry_assets (entry_id, immich_asset_id, position) VALUES (?, ?, ?)",
                        (entry_id, asset_id, position),
                    )

        cursor = await db.execute(
            "SELECT * FROM journal_entries WHERE id = ?", (entry_id,)
        )
        entry = await cursor.fetchone()
        return await _build_entry_response(db, entry)
    finally:
        await db.close()


@router.delete("/entries/{entry_id}")
async def delete_entry(entry_id: int):
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT id FROM journal_entries WHERE id = ?", (entry_id,)
        )
        if not await cursor.fetchone():
            raise HTTPException(status_code=404, detail="Entry not found")

        await db.execute("DELETE FROM journal_entries WHERE id = ?", (entry_id,))
        await db.commit()
        return {"ok": True}
    finally:
        await db.close()


@router.get("/entries/by-asset/{asset_id}", response_model=list[EntryResponse])
async def get_entries_for_asset(asset_id: str):
    db = await get_db()
    try:
        cursor = await db.execute(
            """
            SELECT je.* FROM journal_entries je
            JOIN entry_assets ea ON je.id = ea.entry_id
            WHERE ea.immich_asset_id = ?
            ORDER BY je.created_at DESC
            """,
            (asset_id,),
        )
        entries = await cursor.fetchall()
        return await _build_entries_response(db, entries)
    finally:
        await db.close()


@router.post("/entries/by-assets", response_model=AssetIdsWithEntriesResponse)
async def get_assets_with_entries(data: AssetIdsRequest):
    if not data.asset_ids:
        return AssetIdsWithEntriesResponse(asset_ids_with_entries=[])

    db = await get_db()
    try:
        placeholders = ",".join("?" for _ in data.asset_ids)
        query = f"SELECT DISTINCT immich_asset_id FROM entry_assets WHERE immich_asset_id IN ({placeholders})"
        cursor = await db.execute(query, data.asset_ids)
        rows = await cursor.fetchall()
        return AssetIdsWithEntriesResponse(
            asset_ids_with_entries=[r["immich_asset_id"] for r in rows]
        )
    finally:
        await db.close()
