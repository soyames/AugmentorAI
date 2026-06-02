"""
Pre-warm the ChromaDB ONNX embedding model so first-time answer
generation doesn't block on downloading the ~79MB all-MiniLM-L6-v2 model.

Call this during container startup (Dockerfile CMD -> start.sh) and also
as a startup lifespan event in the FastAPI app (main.py).

This is safe to call multiple times -- subsequent invocations are near-instant
because the model is cached in HF_HOME / chromadb's ONNX cache.
"""

import os

# ── ChromaDB telemetry fix ──────────────────────────────────────────────
os.environ.setdefault("CHROMA_TELEMETRY_ENABLED", "false")
os.environ.setdefault("CHROMA_SERVER_TELEMETRY_ENABLED", "false")
# Monkey-patch Posthog._direct_capture BEFORE any ChromaDB import so the
# version-mismatch noise (capture() takes 1 positional argument but 3 were
# given) never reaches stderr. ChromaDB >=0.5.x + posthog >=7.x conflict.
import chromadb.telemetry.product.posthog as _cp
_cp.Posthog._direct_capture = lambda self, event: None  # type: ignore[assignment]

import time
import sys
from pathlib import Path
from chromadb.config import Settings

# Ensure the app module is importable
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


def log(msg: str):
    print(f"[prewarm] {msg}", flush=True)


def prewarm_embeddings(data_dir: Path | None = None) -> float:
    """Trigger ChromaDB embedding model download/cache.

    Returns the elapsed time in seconds.
    """
    start = time.time()

    if data_dir is None:
        data_dir = Path(__file__).resolve().parents[2] / "data"
    chroma_path = data_dir / "chroma" / "prewarm"
    chroma_path.mkdir(parents=True, exist_ok=True)

    log("Initializing ChromaDB PersistentClient...")
    import chromadb

    client = chromadb.PersistentClient(
        path=str(chroma_path),
        settings=Settings(
            anonymized_telemetry=False,
        ),
    )

    log("Triggering embedding model download (all-MiniLM-L6-v2 ONNX ~79MB)...")
    collection = client.get_or_create_collection("prewarm-model")

    # The first add() with text documents triggers ONNX model download/load.
    collection.add(
        ids=["prewarm-model-doc"],
        documents=["Warmup document to pre-load ChromaDB embedding model."],
        metadatas=[{"source": "prewarm"}],
    )

    elapsed = time.time() - start
    log(f"Embedding model ready in {elapsed:.1f}s")

    # Clean up
    try:
        client.delete_collection("prewarm-model")
    except Exception:
        pass

    return elapsed


if __name__ == "__main__":
    prewarm_embeddings()
