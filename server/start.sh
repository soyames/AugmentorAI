#!/bin/bash
# Pre-warm ChromaDB embedding model, then start the uvicorn server.
# This prevents first-time answer generation from blocking on model download.

set -e

echo "[start.sh] Pre-warming ChromaDB embedding model..."
python3 -m app.services.prewarm_embeddings
echo "[start.sh] Pre-warm complete. Starting uvicorn..."

exec uvicorn app.main:app --host 0.0.0.0 --port 8010
