# Thoughtful Frame - README + Code Review Plan

## Context

The app is feature-complete across all 7 phases. This plan covers two final tasks before the project is production-ready:
1. Write a `README.md` with deployment instructions, features, and usage guide
2. Fix a prioritized set of real bugs, security issues, and inefficiencies found in a full code audit

---

## Task 1: Create README.md

**File to create:** `README.md` at the project root

### Sections to include:

**Header** — App name + tagline: "A journaling app for your Immich photo library"

**Features**
- Write journal entries about individual photos or groups of photos
- Browse your Immich photo library in a grid layout
- Multi-select photos to write a single group journal entry
- Chronological journal feed (diary-style)
- Group entries display a horizontal scrollable row of photos
- Edit and delete entries at any time
- Immich API key stays server-side (never exposed to browser)

**Requirements**
- Running Immich server (local network, self-hosted)
- Immich API key (Immich → Account Settings → API Keys)
- Docker

**Deployment on Unraid** (step-by-step):
1. Clone/copy project files to Unraid (e.g. `/mnt/user/appdata/thoughtful-frame`)
2. Copy `.env.example` to `.env` and fill in:
   - `IMMICH_BASE_URL` — internal URL of Immich, e.g. `http://immich_server:2283/api` (use container name if on same Docker network) or `http://192.168.1.x:2283/api`
   - `IMMICH_API_KEY` — from Immich Account Settings → API Keys
   - `DATABASE_PATH` — leave as `/data/thoughtful_frame.db`
3. **Important network step:** The container must share a Docker network with Immich. Find the network name with `docker network ls`. Edit `docker-compose.yml` to match the network name.
4. `docker compose up -d --build`
5. Access at `http://<unraid-ip>:8421`

**Unraid Docker Template alternative:** set Container Port 8000, Host Port 8421, Volume `/data` → `/mnt/user/appdata/thoughtful-frame/data`, set env vars.

**How to Use**
- **Journal tab** — chronological feed of all entries
- **Photos tab** — browse Immich library
  - Click a photo → write a single-photo entry
  - Click "Select Multiple" → check photos → "Write Entry" for a group
- **Writing** — optional title + your thoughts → Save
- **Entry detail** — click any feed card → full view with Edit/Delete
- **Multi-photo entries** — horizontal scrollable row; click any image for full-screen

**Health Check** — `GET /api/health` returns `{ healthy, database, immich }` status

**Local Development**
```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in values
uvicorn backend.main:app --reload
# visit http://localhost:8000
```

---

## Task 2: Code Fixes

Ordered by severity. All fixes are targeted and minimal — no refactoring beyond what's needed.

---

### Fix 1 (HIGH) — N+1 queries in list_entries and get_entries_for_asset
**File:** `backend/routes/journal.py`

`_build_entry_response` runs a separate SELECT for each entry. A 20-item page causes 21 DB queries.

**Fix:** Add `_build_entries_response(db, entry_rows)` that fetches all asset IDs in one query and groups them in Python:

```python
async def _build_entries_response(db, entry_rows) -> list[EntryResponse]:
    if not entry_rows:
        return []
    entry_ids = [r["id"] for r in entry_rows]
    placeholders = ",".join("?" for _ in entry_ids)
    cursor = await db.execute(
        f"SELECT entry_id, immich_asset_id FROM entry_assets "
        f"WHERE entry_id IN ({placeholders}) ORDER BY entry_id, position",
        entry_ids,
    )
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
```

Replace:
- `list_entries` for-loop → `result = await _build_entries_response(db, entries)`
- `get_entries_for_asset` list comp → `return await _build_entries_response(db, entries)`
- Keep single-entry helper `_build_entry_response` for `get_entry`, `create_entry`, `update_entry`

---

### Fix 2 (HIGH) — Missing transactions in create_entry and update_entry
**File:** `backend/routes/journal.py`

If `journal_entries` INSERT succeeds but an `entry_assets` INSERT fails (e.g. duplicate asset), the DB is left with an orphaned entry with no photos.

**Fix:** Use `async with db:` context manager (aiosqlite auto-commits on clean exit, rolls back on exception):

In `create_entry`:
```python
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
# Remove the manual await db.commit() that was below this block
```

Apply the same `async with db:` pattern to the `update_entry` transaction (the UPDATE + DELETE + re-INSERT block).

---

### Fix 3 (HIGH) — DB connection leak in database.py init_db
**File:** `backend/database.py`

If any statement fails, the connection is never closed.

**Fix:** Wrap in try/finally:
```python
async def init_db():
    db = await get_db()
    try:
        await db.execute("CREATE TABLE IF NOT EXISTS journal_entries ...")
        await db.execute("CREATE TABLE IF NOT EXISTS entry_assets ...")
        await db.execute("CREATE INDEX IF NOT EXISTS ...")
        await db.execute("CREATE INDEX IF NOT EXISTS ...")
        await db.execute("CREATE INDEX IF NOT EXISTS ...")
        await db.commit()
    finally:
        await db.close()
```

---

### Fix 4 (HIGH) — Selection bar stays in DOM when navigating away from Browse
**File:** `frontend/js/views/browse.js`

If user navigates away while multi-select is active, the floating `.selection-bar` remains over other views.

**Fix:** Add `removeSelectionBar()` call at the very top of `renderBrowse`:
```javascript
export async function renderBrowse(container) {
    removeSelectionBar();  // ← add this
    multiSelectActive = false;
    selectedAssetIds = [];
    ...
```

---

### Fix 5 (HIGH) — Modal overlay click listener accumulates on repeated opens
**File:** `frontend/js/components/modal.js`

Each `showEntryModal` call adds a new `click` listener to `#modal-overlay`. After 5 opens, 5 handlers fire on backdrop click.

**Fix:** Add `{ once: true }` to the overlay backdrop listener:
```javascript
overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeModal();
}, { once: true });
```

---

### Fix 6 (MEDIUM) — Stale data.total reference in feed.js load-more
**File:** `frontend/js/views/feed.js`

Inside the load-more handler, `data.total` refers to the first-page fetch. After loading more pages, it should use the latest response's total.

**Fix:** Change the pagination hide check to use `moreData`:
```javascript
if (moreData.total <= currentPage * pageSize) {
    loadMoreEl.classList.add("hidden");
}
```

---

### Fix 7 (MEDIUM) — XSS risk in photoGrid.js alt attribute
**File:** `frontend/js/components/photoGrid.js`

`asset.originalFileName` used directly in an HTML attribute without escaping. A filename containing `"` or `>` could break the attribute.

**Fix:** Add and use `escapeAttr`:
```javascript
function escapeAttr(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}
// usage: alt="${escapeAttr(asset.originalFileName || 'Photo')}"
```

---

### Fix 8 (MEDIUM) — DB connection leak in health_check
**File:** `backend/main.py`

If `db.execute("SELECT 1")` throws, `db.close()` is skipped.

**Fix:**
```python
try:
    db = await get_db()
    try:
        await db.execute("SELECT 1")
    finally:
        await db.close()
except Exception as e:
    status["database"] = f"error: {e}"
```

---

### Fix 9 (LOW) — httpx client never closed on shutdown
**File:** `backend/immich_client.py` + `backend/main.py`

The singleton `httpx.AsyncClient` is never closed when the app shuts down.

**Fix:** Add a `close()` function to `immich_client.py`:
```python
async def close():
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None
```

And call it in the `main.py` lifespan:
```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield
    await immich_client.close()
```

---

### Fix 10 (LOW) — Dockerfile: non-root user + HEALTHCHECK
**File:** `Dockerfile`

App runs as root; no health check for Unraid container monitoring.

**Fix:** Add a non-root user and use Python's stdlib for the health check (avoids installing curl in the slim image):
```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./backend/
COPY frontend/ ./frontend/
RUN mkdir -p /data && adduser --disabled-password --gecos "" appuser && chown -R appuser /data
USER appuser
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health')" || exit 1
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

---

## Files to Modify

| File | Task |
|---|---|
| `README.md` | Create (Task 1) |
| `backend/routes/journal.py` | Fix 1, Fix 2 |
| `backend/database.py` | Fix 3 |
| `backend/main.py` | Fix 8, Fix 9 (lifespan) |
| `backend/immich_client.py` | Fix 9 |
| `frontend/js/views/browse.js` | Fix 4 |
| `frontend/js/components/modal.js` | Fix 5 |
| `frontend/js/views/feed.js` | Fix 6 |
| `frontend/js/components/photoGrid.js` | Fix 7 |
| `Dockerfile` | Fix 10 |

---

## Verification

1. Start the app: `uvicorn backend.main:app --reload`
2. `GET /api/health` → `{"healthy": true, "database": "ok", "immich": "ok"}`
3. Load the Journal feed → confirm it works (only 2 DB queries per page, not 21)
4. Browse photos, enter multi-select, select 3, navigate to Journal → selection bar should be gone
5. Open modal 5+ times, save → confirm only one save fires
6. `docker build -t thoughtful-frame .` → `docker inspect thoughtful-frame | grep -A5 Health` shows healthcheck
