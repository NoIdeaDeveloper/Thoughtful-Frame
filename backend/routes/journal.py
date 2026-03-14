import json
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
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
logger = logging.getLogger(__name__)


async def _get_current_asset_ids(db, entry_id: int) -> list[str]:
    cursor = await db.execute(
        "SELECT immich_asset_id FROM entry_assets WHERE entry_id = ?", (entry_id,)
    )
    return [row["immich_asset_id"] for row in await cursor.fetchall()]


async def _get_next_position(db, entry_id: int) -> int:
    cursor = await db.execute(
        "SELECT MAX(position) FROM entry_assets WHERE entry_id = ?", (entry_id,)
    )
    row = await cursor.fetchone()
    return row[0] + 1 if row and row[0] is not None else 0


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
        summary=entry_row["summary"] if "summary" in entry_row.keys() else "",
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
            summary=r["summary"] if "summary" in r.keys() else "",
            body=r["body"],
            created_at=r["created_at"],
            updated_at=r["updated_at"],
        )
        for r in entry_rows
    ]


@router.get("/entries", response_model=EntryListResponse)
async def list_entries(page: int = 1, page_size: int = 20):
    logger.debug(f"Listing entries - page: {page}, page_size: {page_size}")
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
    logger.info(f"Creating new entry with {len(data.immich_asset_ids)} assets")
    if not data.immich_asset_ids:
        logger.warning("Create entry attempt with no asset IDs")
        raise HTTPException(status_code=400, detail="At least one asset ID is required")

    now = datetime.now(timezone.utc).isoformat()
    created_at = data.created_at if data.created_at else now
    db = await get_db()
    try:
        # Start transaction
        cursor = await db.execute(
            "INSERT INTO journal_entries (title, summary, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
            (data.title, data.summary, data.body, created_at, now),
        )
        entry_id = cursor.lastrowid

        # Insert all assets using batch operation
        if data.immich_asset_ids:
            await db.executemany(
                "INSERT INTO entry_assets (entry_id, immich_asset_id, position) VALUES (?, ?, ?)",
                [(entry_id, asset_id, position) for position, asset_id in enumerate(data.immich_asset_ids)]
            )

        # Commit transaction
        await db.commit()

        # Fetch and return the created entry
        cursor = await db.execute(
            "SELECT * FROM journal_entries WHERE id = ?", (entry_id,)
        )
        entry = await cursor.fetchone()
        return await _build_entry_response(db, entry)

    except HTTPException:
        raise
    except Exception as e:
        # Rollback on error
        await db.rollback()
        logger.error(f"Failed to create entry: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to create entry: {str(e)}")

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
        new_summary = data.summary if data.summary is not None else (entry["summary"] if "summary" in entry.keys() else "")
        new_body = data.body if data.body is not None else entry["body"]
        new_created_at = data.created_at if data.created_at is not None else entry["created_at"]

        await db.execute(
            "UPDATE journal_entries SET title = ?, summary = ?, body = ?, created_at = ?, updated_at = ? WHERE id = ?",
            (new_title, new_summary, new_body, new_created_at, now, entry_id),
        )

        if data.immich_asset_ids is not None:
            if not data.immich_asset_ids:
                raise HTTPException(
                    status_code=400, detail="At least one asset ID is required"
                )

            current_assets = await _get_current_asset_ids(db, entry_id)

            # If all new assets are different from current ones, replace all
            if all(asset_id not in current_assets for asset_id in data.immich_asset_ids):
                await db.execute(
                    "DELETE FROM entry_assets WHERE entry_id = ?", (entry_id,)
                )
                # Insert all assets using batch operation
                if data.immich_asset_ids:
                    await db.executemany(
                        "INSERT INTO entry_assets (entry_id, immich_asset_id, position) VALUES (?, ?, ?)",
                        [(entry_id, asset_id, position) for position, asset_id in enumerate(data.immich_asset_ids)]
                    )
            else:
                # Remove assets not in the new list
                for asset_id in current_assets:
                    if asset_id not in data.immich_asset_ids:
                        await db.execute(
                            "DELETE FROM entry_assets WHERE entry_id = ? AND immich_asset_id = ?",
                            (entry_id, asset_id),
                        )

                # Add new assets not already present
                assets_to_add = [a for a in data.immich_asset_ids if a not in current_assets]
                if assets_to_add:
                    start_pos = await _get_next_position(db, entry_id)
                    # Insert all assets using batch operation
                    await db.executemany(
                        "INSERT INTO entry_assets (entry_id, immich_asset_id, position) VALUES (?, ?, ?)",
                        [(entry_id, asset_id, position) for position, asset_id in enumerate(assets_to_add, start_pos)]
                    )

        # Commit transaction
        await db.commit()

        cursor = await db.execute(
            "SELECT * FROM journal_entries WHERE id = ?", (entry_id,)
        )
        entry = await cursor.fetchone()
        return await _build_entry_response(db, entry)

    except HTTPException:
        raise
    except Exception as e:
        # Rollback on error
        await db.rollback()
        logger.error(f"Failed to update entry: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to update entry: {str(e)}")

    finally:
        await db.close()


@router.post("/entries/{entry_id}/assets")
async def add_assets_to_entry(entry_id: int, data: EntryUpdate):
    """
    Add assets to an existing entry without replacing all assets.
    
    Request body should contain:
    {
        "immich_asset_ids": ["asset_id_1", "asset_id_2"]
    }
    """
    if not data.immich_asset_ids:
        raise HTTPException(status_code=400, detail="At least one asset ID is required")
    
    db = await get_db()
    try:
        # Verify entry exists
        cursor = await db.execute(
            "SELECT id FROM journal_entries WHERE id = ?", (entry_id,)
        )
        if not await cursor.fetchone():
            raise HTTPException(status_code=404, detail="Entry not found")
        
        current_assets = await _get_current_asset_ids(db, entry_id)
        new_assets = [a for a in data.immich_asset_ids if a not in current_assets]

        if not new_assets:
            return {"message": "All specified assets already exist in this entry", "added": []}

        start_pos = await _get_next_position(db, entry_id)
        for position, asset_id in enumerate(new_assets, start=start_pos):
            await db.execute(
                "INSERT INTO entry_assets (entry_id, immich_asset_id, position) VALUES (?, ?, ?)",
                (entry_id, asset_id, position),
            )
        
        await db.commit()
        return {"message": f"Successfully added {len(new_assets)} assets", "added": new_assets}
        
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Failed to add assets to entry: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to add assets: {str(e)}")
    finally:
        await db.close()


@router.post("/entries/{entry_id}/assets/remove")
async def remove_assets_from_entry(entry_id: int, request: AssetIdsRequest):
    """
    Remove specific assets from an entry.

    Request body should contain:
    {
        "asset_ids": ["asset_id_1", "asset_id_2"]
    }
    """
    asset_ids = request.asset_ids
    if not asset_ids:
        raise HTTPException(status_code=400, detail="At least one asset ID is required")
    
    db = await get_db()
    try:
        # Verify entry exists
        cursor = await db.execute(
            "SELECT id FROM journal_entries WHERE id = ?", (entry_id,)
        )
        if not await cursor.fetchone():
            raise HTTPException(status_code=404, detail="Entry not found")
        
        # Remove specified assets
        removed_count = 0
        for asset_id in asset_ids:
            cursor = await db.execute(
                "DELETE FROM entry_assets WHERE entry_id = ? AND immich_asset_id = ?",
                (entry_id, asset_id)
            )
            if cursor.rowcount > 0:
                removed_count += 1
        
        await db.commit()
        
        if removed_count == 0:
            return {"message": "No assets were removed (may not exist in entry)", "removed": 0}
        
        return {"message": f"Successfully removed {removed_count} assets", "removed": removed_count}
        
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Failed to remove assets from entry: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to remove assets: {str(e)}")
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


@router.get("/linked-asset-ids")
async def get_all_linked_asset_ids():
    """Get all Immich asset IDs that have journal entries (for frontend caching)."""
    db = await get_db()
    try:
        cursor = await db.execute("SELECT DISTINCT immich_asset_id FROM entry_assets")
        rows = await cursor.fetchall()
        return {"asset_ids": [r["immich_asset_id"] for r in rows]}
    finally:
        await db.close()


@router.get("/export")
async def export_journal():
    """Export all journal entries as a downloadable JSON file."""
    db = await get_db()
    try:
        cursor = await db.execute("SELECT * FROM journal_entries ORDER BY created_at ASC")
        entry_rows = await cursor.fetchall()
        entries = await _build_entries_response(db, entry_rows)
    finally:
        await db.close()

    export_data = {
        "version": "1",
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "entries": [
            {
                "title": e.title,
                "summary": e.summary,
                "body": e.body,
                "created_at": e.created_at,
                "updated_at": e.updated_at,
                "immich_asset_ids": e.immich_asset_ids,
            }
            for e in entries
        ],
    }

    date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    filename = f"thoughtful-frame-{date_str}.json"
    content = json.dumps(export_data, indent=2)
    return StreamingResponse(
        iter([content]),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/import")
async def import_journal(data: dict):
    """Import journal entries from an exported JSON file."""
    if data.get("version") != "1":
        raise HTTPException(status_code=400, detail="Unsupported export version")

    entries_data = data.get("entries", [])
    if not isinstance(entries_data, list):
        raise HTTPException(status_code=400, detail="Invalid export format")

    imported = 0
    errors = []

    db = await get_db()
    try:
        for i, entry in enumerate(entries_data):
            try:
                title = entry.get("title", "")
                summary = entry.get("summary", "")
                body = entry.get("body", "")
                asset_ids = entry.get("immich_asset_ids", [])
                created_at = entry.get("created_at") or datetime.now(timezone.utc).isoformat()
                updated_at = entry.get("updated_at") or created_at

                if not body or not asset_ids:
                    errors.append(f"Entry {i}: missing body or asset IDs")
                    continue

                cursor = await db.execute(
                    "INSERT INTO journal_entries (title, summary, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
                    (title, summary, body, created_at, updated_at),
                )
                entry_id = cursor.lastrowid

                # Insert all assets using batch operation
                if asset_ids:
                    await db.executemany(
                        "INSERT INTO entry_assets (entry_id, immich_asset_id, position) VALUES (?, ?, ?)",
                        [(entry_id, asset_id, position) for position, asset_id in enumerate(asset_ids)]
                    )

                imported += 1
            except Exception as e:
                errors.append(f"Entry {i}: {str(e)}")

        await db.commit()
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Import failed: {str(e)}")
    finally:
        await db.close()

    return {"imported": imported, "errors": errors}
