# syntax=docker/dockerfile:1.7

FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim AS builder

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

RUN sed -i 's|http://deb.debian.org|https://deb.debian.org|g' /etc/apt/sources.list.d/debian.sources 2>/dev/null || true; \
    apt-get update \
    && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/server

COPY server/pyproject.toml server/uv.lock ./
RUN uv sync --frozen --no-dev

COPY server/app ./app

# Pre-bake the ChromaDB ONNX embedding model (~79 MB) and the faster-whisper
# tiny model (~39 MB) into the image so containers start instantly.
ENV CHROMA_TELEMETRY_ENABLED=false \
    CHROMA_SERVER_TELEMETRY_ENABLED=false \
    HF_HOME=/root/.cache/huggingface \
    PATH="/app/server/.venv/bin:${PATH}"

RUN python3 app/services/prewarm_embeddings.py

# Download faster-whisper tiny model at build time
RUN python3 -c "from faster_whisper import WhisperModel; WhisperModel('tiny', device='cpu', compute_type='int8'); print('[build] Whisper tiny model cached OK')"


FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim AS runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    HF_HOME=/root/.cache/huggingface \
    CHROMA_TELEMETRY_ENABLED=false \
    CHROMA_SERVER_TELEMETRY_ENABLED=false \
    WHISPER_MODEL_SIZE=tiny \
    PATH="/app/server/.venv/bin:${PATH}"

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/server

COPY --from=builder /app/server/.venv ./.venv
# Bring pre-baked model caches so nothing downloads at runtime
COPY --from=builder /root/.cache/chroma /root/.cache/chroma
COPY --from=builder /root/.cache/huggingface /root/.cache/huggingface

COPY server/app ./app
COPY server/start.sh ./
RUN chmod +x start.sh

RUN mkdir -p /app/server/data

EXPOSE 8010
VOLUME ["/app/server/data"]

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=5 \
    CMD curl -fsS http://localhost:8010/health || exit 1

CMD ["/bin/bash", "./start.sh"]
