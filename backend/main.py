import logging
import os
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from contextlib import asynccontextmanager
import httpx
from backend.database import init_db, get_db
from backend.routes import journal, immich_proxy
from backend import immich_client

# Configure verbose logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(module)s:%(lineno)d - %(message)s',
    handlers=[
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Configure uvicorn logging to be more verbose
uvicorn_logger = logging.getLogger("uvicorn")
uvicorn_logger.setLevel(logging.DEBUG)
uvicorn_access_logger = logging.getLogger("uvicorn.access")
uvicorn_access_logger.setLevel(logging.DEBUG)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Application starting up...")
    logger.debug("Initializing database...")
    await init_db()
    logger.info("Database initialized successfully")
    yield
    logger.info("Application shutting down...")
    logger.debug("Closing Immich client...")
    await immich_client.close()
    logger.info("Shutdown complete")


app = FastAPI(title="Thoughtful Frame", lifespan=lifespan)

app.include_router(immich_proxy.router, prefix="/api/immich")
app.include_router(journal.router, prefix="/api/journal")


@app.get("/api/health")
async def health_check():
    logger.info("Health check endpoint called")
    status = {"database": "ok", "immich": "ok"}

    try:
        db = await get_db()
        try:
            await db.execute("SELECT 1")
        finally:
            await db.close()
    except Exception as e:
        status["database"] = f"error: {e}"
        logger.error(f"Database health check failed: {e}", exc_info=True)

    try:
        await immich_client.get_assets(page=1, page_size=1)
    except httpx.ConnectError:
        status["immich"] = "error: cannot reach Immich server"
        logger.error("Immich health check failed: cannot reach Immich server")
    except Exception as e:
        status["immich"] = f"error: {e}"
        logger.error(f"Immich health check failed: {e}")

    healthy = all(v == "ok" for v in status.values())
    return {"healthy": healthy, **status}


# Mount static files with proper cache control
app.mount(
    "/static",
    StaticFiles(directory="frontend", html=True),
    name="static"
)


@app.get("/")
async def serve_index():
    logger.debug("Serving index.html")
    return FileResponse(
        "frontend/index.html",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0"
        }
    )
