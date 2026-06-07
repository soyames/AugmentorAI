import os
from dotenv import load_dotenv
load_dotenv()
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.api import sessions, documents, settings, websocket, analytics, hermes
from app.models.database import create_tables
from app.api.documents import retry_pending_embeddings
from app.services.prewarm_embeddings import prewarm_embeddings
from app.services.transcription import get_transcription_service

# ── ChromaDB telemetry fix ──────────────────────────────────────────────
# ChromaDB's Posthog client calls posthog.capture(user_id, event, {...})
# but posthog >=7.x expects capture(event, **kwargs) only. The call fails
# and logs a noisy traceback on every ChromaDB operation. Since we disable
# telemetry anyway, just silence the broken method entirely.
import chromadb.telemetry.product.posthog as _chroma_posthog
_chroma_posthog.Posthog._direct_capture = lambda self, event: None  # type: ignore[assignment]


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup — each step is isolated so one failure never brings down workers
    create_tables()
    try:
        retry_pending_embeddings()
    except Exception as exc:
        print(f"[startup] retry_pending_embeddings skipped: {exc}", flush=True)
    try:
        prewarm_embeddings()
    except Exception as exc:
        print(f"[startup] prewarm skipped (model will load on first use): {exc}", flush=True)
    try:
        get_transcription_service()
        print("[startup] Whisper model loaded", flush=True)
    except Exception as exc:
        print(f"[startup] Whisper load skipped: {exc}", flush=True)
    yield
    # Shutdown


app = FastAPI(
    title="AugmentorAI",
    description="AI-powered interview practice copilot API",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:8080,http://127.0.0.1:8080").split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(sessions.router, prefix="/api/sessions", tags=["sessions"])
app.include_router(documents.router, prefix="/api/documents", tags=["documents"])
app.include_router(settings.router, prefix="/api/settings", tags=["settings"])
app.include_router(analytics.router, prefix="/api/analytics", tags=["analytics"])
app.include_router(hermes.router, tags=["hermes"])
app.include_router(websocket.router, prefix="/ws", tags=["websocket"])


# Remove the duplicate test route since include_router now works
# The analytics router is mounted at /api/analytics above

@app.get("/")
async def root():
    return {"message": "AugmentorAI API", "version": "1.0.0"}


@app.get("/health")
async def health():
    return {"status": "healthy"}
