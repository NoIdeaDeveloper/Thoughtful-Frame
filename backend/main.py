from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from contextlib import asynccontextmanager
import httpx
from backend.database import init_db, get_db
from backend.routes import journal, immich_proxy
from backend import immich_client


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(title="Thoughtful Frame", lifespan=lifespan)

app.include_router(immich_proxy.router, prefix="/api/immich")
app.include_router(journal.router, prefix="/api/journal")


@app.get("/api/health")
async def health_check():
    status = {"database": "ok", "immich": "ok"}

    try:
        db = await get_db()
        await db.execute("SELECT 1")
        await db.close()
    except Exception as e:
        status["database"] = f"error: {e}"

    try:
        await immich_client.get_assets(page=1, page_size=1)
    except httpx.ConnectError:
        status["immich"] = "error: cannot reach Immich server"
    except Exception as e:
        status["immich"] = f"error: {e}"

    healthy = all(v == "ok" for v in status.values())
    return {"healthy": healthy, **status}


app.mount("/static", StaticFiles(directory="frontend"), name="static")


@app.get("/")
async def serve_index():
    return FileResponse("frontend/index.html")
