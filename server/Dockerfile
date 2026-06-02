# syntax=docker/dockerfile:1.7

FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim AS builder

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/server

COPY server/pyproject.toml server/uv.lock ./
RUN uv sync --frozen --no-dev

FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim AS runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    HF_HOME=/app/server/data/huggingface \
    CHROMA_SERVER_TELEMETRY_ENABLED=false \
    CHROMA_TELEMETRY_ENABLED=false \
    PATH="/app/server/.venv/bin:${PATH}"

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/server

COPY --from=builder /app/server/.venv ./.venv
COPY server/app ./app

COPY server/start.sh ./
RUN chmod +x start.sh

RUN mkdir -p /app/server/data

EXPOSE 8010
VOLUME ["/app/server/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 \
    CMD curl -fsS http://localhost:8010/health || exit 1

CMD ["./start.sh"]
