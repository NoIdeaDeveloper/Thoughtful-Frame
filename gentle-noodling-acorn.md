# Performance Improvement Plan: Thoughtful Frame

## Context
The application is a FastAPI + SQLite + vanilla JS photo journal. The fundamentals are solid (async backend, WAL mode, lazy image loading), but several patterns introduce unnecessary latency. This plan identifies improvements ranked by **performance gain vs. implementation complexity**.

---

## Improvements (Ranked by Impact/Complexity Ratio)

### 1. Fix Blocking Cache Cleanup (HIGH gain / LOW complexity)
**Files:** `backend/routes/immich_proxy.py` lines 28–61

**Problem:** `cleanup_cache_if_needed()` uses synchronous `Path.stat()` and `file.unlink()` calls inside an async request handler. With a large cache (hundreds of files), this can block the event loop for 100–500ms, stalling all other requests.

**Fix:** Run the cleanup in a thread pool via `asyncio.to_thread()` or `loop.run_in_executor()`, and move it to a background task so it doesn't block the response.

```python
# Replace blocking cleanup with:
asyncio.create_task(asyncio.to_thread(cleanup_cache_sync))
```

**Gain:** Eliminates 100–500ms stalls on cache-miss requests.
**Complexity:** Low — 10–15 line change.

---

### 2. Async Database Connection Pooling (HIGH gain / MEDIUM complexity)
**Files:** `backend/database.py`, all route files

**Problem:** Every request creates a new aiosqlite connection, sets PRAGMAs, then closes it. Connection creation overhead adds ~5–15ms per request. With concurrent requests this is compounded.

**Fix:** Use a persistent shared connection (aiosqlite supports this) or a lightweight pool. For SQLite a single shared async connection with serialized writes is idiomatic and eliminates per-request connection churn.

```python
# database.py - open once at startup, share across requests
_db_connection: aiosqlite.Connection | None = None

async def get_db() -> aiosqlite.Connection:
    global _db_connection
    if _db_connection is None:
        _db_connection = await aiosqlite.connect(DB_PATH)
        await _db_connection.execute("PRAGMA journal_mode=WAL")
        await _db_connection.execute("PRAGMA foreign_keys=ON")
    return _db_connection
```

**Gain:** Saves 5–15ms per request; larger benefit under concurrent load.
**Complexity:** Medium — requires changing connection lifecycle, handling reconnects.

---

### 3. Batch Asset Inserts (MEDIUM gain / LOW complexity)
**Files:** `backend/routes/journal.py` lines 142–146, 205–209, 223–227, 474–477

**Problem:** Asset insertion uses N sequential `await db.execute()` calls inside loops. Each `execute()` on aiosqlite is a round-trip to a thread pool. For an entry with 20 photos = 20 sequential coroutine hops.

**Fix:** Use `executemany()` for batch inserts.

```python
# Instead of a loop:
await db.executemany(
    "INSERT OR IGNORE INTO entry_assets (entry_id, immich_asset_id, position) VALUES (?, ?, ?)",
    [(entry_id, asset_id, i) for i, asset_id in enumerate(asset_ids)]
)
```

**Gain:** 10–50ms savings on entry create/update with many assets.
**Complexity:** Low — drop-in replacement.

---

### 4. Batch Settings Reads (MEDIUM gain / LOW complexity)
**Files:** `backend/routes/settings.py` lines 17–23

**Problem:** `getSettings()` fetches individual config keys with separate `SELECT` queries instead of one `SELECT ... WHERE key IN (...)`.

**Fix:** Fetch all needed keys in a single query.

```python
keys = ("immich_url", "immich_api_key", "immich_user_id")
async with db.execute(
    f"SELECT key, value FROM settings WHERE key IN ({','.join('?' * len(keys))})", keys
) as cursor:
    return {row[0]: row[1] async for row in cursor}
```

**Gain:** Reduces N DB round-trips to 1 per settings load.
**Complexity:** Low — straightforward refactor.

---

### 5. Lazy-Load Chart.js (LOW gain / LOW complexity)
**Files:** `frontend/index.html` line 9, `frontend/js/views/stats.js`

**Problem:** `chart.umd.min.js` (~200KB minified) is loaded on every page, including pages that never show charts.

**Fix:** Dynamically import Chart.js only when the stats view is loaded.

```js
// In stats.js initView():
const { Chart } = await import('/vendor/chart.umd.min.js');
```

**Gain:** ~200KB less JS parsed/executed on non-stats pages. Improves initial load time.
**Complexity:** Low — one-line change in stats.js, remove script tag from HTML.

---

### 6. Memoize Entry-to-Asset Lookups in Browse View (MEDIUM gain / MEDIUM complexity)
**Files:** `frontend/js/views/browse.js`, `frontend/js/api.js`

**Problem:** Every page of 100 assets in the browse view triggers a separate `checkAssetsWithEntries()` API call. Scrolling through 500 photos = 5 sequential API round trips that must complete before the UI indicates which photos have journal entries.

**Fix:** Cache the full set of asset IDs that have entries in a `Set`, populated lazily on first load. Subsequent pages check the cache instead of making API calls.

```js
let _linkedAssetIds = null;

async function getLinkedAssetIds() {
    if (!_linkedAssetIds) {
        const all = await api.getAllLinkedAssetIds(); // new endpoint returning all IDs
        _linkedAssetIds = new Set(all);
    }
    return _linkedAssetIds;
}
```

**Backend:** Add `GET /api/journal/linked-asset-ids` returning all linked Immich asset IDs (simple SELECT DISTINCT query, tiny payload).

**Gain:** Eliminates repeated API calls during browse; faster indicator rendering.
**Complexity:** Medium — new endpoint + frontend cache logic.

---

### 7. Add HTTP Cache Headers for Static Assets (LOW gain / LOW complexity)
**Files:** `backend/main.py`

**Problem:** Static files (JS, CSS, images) are served without cache headers, so browsers re-request them on every page load.

**Fix:** Add `Cache-Control` headers when mounting static files, or configure an Nginx layer in Docker to serve statics with long-lived cache.

```python
# main.py - custom StaticFiles with cache headers
from fastapi.staticfiles import StaticFiles

app.mount("/", CachedStaticFiles(directory="frontend"), name="static")
```

**Gain:** After first load, static assets served from browser cache — eliminates 5–20 network requests per navigation.
**Complexity:** Low — config change.

---

## Summary Table

| # | Change | Files | Gain | Complexity |
|---|--------|-------|------|------------|
| 1 | Async cache cleanup | `immich_proxy.py` | HIGH (−100–500ms stall) | LOW |
| 2 | DB connection reuse | `database.py`, routes | HIGH (−5–15ms/req) | MEDIUM |
| 3 | Batch asset inserts | `journal.py` | MEDIUM (−10–50ms on write) | LOW |
| 4 | Batch settings reads | `settings.py` | MEDIUM (−N DB queries → 1) | LOW |
| 5 | Lazy-load Chart.js | `index.html`, `stats.js` | LOW (−200KB parse on load) | LOW |
| 6 | Memoize asset-entry lookup | `browse.js`, `api.js` | MEDIUM (−N API calls) | MEDIUM |
| 7 | Static asset cache headers | `main.py` | LOW (browser cache) | LOW |

## Verification
- Browse the photo grid and confirm journal indicators appear without multiple network requests (DevTools → Network)
- Create an entry with 20+ photos and time the save operation
- Profile the event loop during a cache miss using `asyncio` debug mode or a simple timing middleware
- Load the app on a throttled connection (DevTools → 3G) and measure JS parse time before/after Chart.js lazy load
