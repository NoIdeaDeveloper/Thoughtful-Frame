import logging
import os
from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
import httpx
from backend.database import open_db, close_db, init_db, get_db
from backend.routes import journal, immich_proxy, settings
from backend.routes import auth as auth_routes
from backend import immich_client
from backend.auth import require_auth
from backend.config import APP_PASSWORD

# Configure logging before any class definitions that use logger
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(module)s:%(lineno)d - %(message)s',
    handlers=[
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)


class CachedStaticFiles(StaticFiles):
    """Custom StaticFiles with long-lived cache headers for better performance."""

    async def get_response(self, path: str, scope, receive, send):
        try:
            response = await super().get_response(path, scope, receive, send)
            # Extract just the filename part for matching
            filename = path.split('/')[-1]
            if filename.endswith(('.js', '.css', '.jpg', '.jpeg', '.png', '.gif', '.svg', '.woff', '.woff2')):
                response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
            return response
        except Exception as e:
            logger.error(f"Failed to serve static file {path}: {e}", exc_info=True)
            raise

# Configure uvicorn logging to be more verbose
uvicorn_logger = logging.getLogger("uvicorn")
uvicorn_logger.setLevel(logging.DEBUG)
uvicorn_access_logger = logging.getLogger("uvicorn.access")
uvicorn_access_logger.setLevel(logging.DEBUG)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Application starting up...")
    logger.debug("Opening database connection...")
    await open_db()
    logger.debug("Initializing database schema...")
    await init_db()
    logger.info("Database initialized successfully")
    yield
    logger.info("Application shutting down...")
    logger.debug("Closing database connection...")
    await close_db()
    logger.debug("Closing Immich client...")
    await immich_client.close()
    logger.info("Shutdown complete")


app = FastAPI(title="Thoughtful Frame", lifespan=lifespan)

# Auth middleware: protect all /api/* routes except /api/auth/* and /api/health
UNPROTECTED_PREFIXES = ("/api/auth/", "/api/health")

@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    if APP_PASSWORD and request.url.path.startswith("/api/"):
        if not any(request.url.path.startswith(p) for p in UNPROTECTED_PREFIXES):
            try:
                require_auth(request)
            except Exception:
                return JSONResponse(status_code=401, content={"detail": "Unauthorized"})
    return await call_next(request)

app.include_router(auth_routes.router, prefix="/api")
app.include_router(immich_proxy.router, prefix="/api/immich")
app.include_router(journal.router, prefix="/api/journal")
app.include_router(settings.router, prefix="/api")


@app.get("/api/health")
async def health_check():
    logger.info("Health check endpoint called")
    status = {"database": "ok", "immich": "ok"}

    try:
        db = get_db()
        await db.execute("SELECT 1")
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
    CachedStaticFiles(directory="frontend", html=True),
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


@app.get("/login")
async def serve_login():
    return FileResponse(
        "frontend/login.html",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0"
        }
    )
