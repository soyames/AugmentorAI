#!/bin/bash
# Pre-warm ChromaDB embedding model, then start the production gunicorn server.
# Prevents first-time answer generation from blocking on model download,
# and provides production-grade multi-worker serving.

set -e

echo "[start.sh] Pre-warming ChromaDB embedding model..."
python3 -m app.services.prewarm_embeddings
echo "[start.sh] Pre-warm complete. Starting gunicorn with uvicorn workers..."

exec gunicorn app.main:app \
    --worker-class uvicorn.workers.UvicornWorker \
    --workers 4 \
    --bind 0.0.0.0:8010 \
    --max-requests 1000 \
    --max-requests-jitter 100 \
    --timeout 120 \
    --keep-alive 32 \
    --access-logfile - \
    --error-logfile -
