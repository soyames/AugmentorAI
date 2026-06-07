#!/bin/bash
# The ChromaDB ONNX embedding model is pre-baked into the image during docker build,
# so we skip the blocking download and start gunicorn immediately.

set -e

echo "[start.sh] Starting gunicorn with 2 uvicorn workers..."

exec gunicorn app.main:app \
    --worker-class uvicorn.workers.UvicornWorker \
    --workers 2 \
    --bind 0.0.0.0:8010 \
    --max-requests 1000 \
    --max-requests-jitter 100 \
    --timeout 120 \
    --keep-alive 32 \
    --access-logfile - \
    --error-logfile -
