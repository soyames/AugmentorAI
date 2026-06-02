"""
Pre-warm the ChromaDB ONNX embedding model so first-time answer
generation doesn't block on downloading the ~79MB all-MiniLM-L6-v2 model.

Call this during container startup (Dockerfile CMD -> start.sh) and also
as a startup lifespan event in the FastAPI app (main.py).

This is safe to call multiple times — subsequent invocations are near-instant
because the model is cached in HF_HOME / chromadb's ONNX cache.
"""

import time
import sys
from pathlib import Path

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

    client = chromadb.PersistentClient(path=str(chroma_path))

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
