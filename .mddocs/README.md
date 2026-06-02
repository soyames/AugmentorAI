# AugmentorAI — Documentation & Deployment Guide

**Purpose:** AI-powered interview copilot — real-time transcription, question detection, RAG-based answers with multi-provider LLM support.

**Stack:**
- **Backend:** Python 3.12 (FastAPI + gunicorn + uvicorn workers)
- **Frontend:** React + TypeScript + Vite served by nginx
- **Database:** SQLite (via SQLAlchemy)
- **Vector Store:** ChromaDB (all-MiniLM-L6-v2 ONNX embeddings)
- **Transcription:** faster-whisper
- **LLM Providers:** Gemini (primary), DeepSeek (secondary), Ollama (local fallback), Hermes API

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    nginx (container)                  │
│           port 8080 → serves React SPA                │
│           /api/* → upstream to gunicorn               │
│           /ws/*  → websocket proxy                    │
└────────────────┬────────────────────────────────────┘
                 │ http://augmentorai_server:8010
┌────────────────▼────────────────────────────────────┐
│           gunicorn (4 uvicorn workers)                │
│           FastAPI app on port 8010                    │
│  ┌──────────┼──────────┬──────────┬──────────┐       │
│  │ REST API │ WebSocket│ RAG      │ Analytics │       │
│  │ sessions │ streaming│ ChromaDB │ endpoints │       │
│  └──────────┴──────────┴──────────┴──────────┘       │
└──────────────────────────────────────────────────────┘
```

## Current Setup (Oracle VM, Docker/Podman)

| Component | Container | Mode |
|-----------|-----------|------|
| Backend | `augmentorai_server_1` | host networking, port 8010 |
| Frontend | `augmentorai_web_1` | host networking, port 8080 |
| Ollama | `ai-ollama` (separate) | host networking, port 11434 |

All containers use `network_mode: host` for simplicity.

---

## Deployment

### Prerequisites

- Podman (or Docker)
- podman-compose (or docker-compose)
- 4+ GB RAM recommended

### Quick Start

```bash
cd ~/projects/AugmentorAI

# Optional: configure API keys in .env
cat > .env << EOF
GEMINI_API_KEY=your_gemini_key
DEEPSEEK_API_KEY=your_deepseek_key
HERMES_API_KEY=your_hermes_key
EOF

# Build and start
podman-compose up --build -d

# Check health
curl http://localhost:8010/health
curl http://localhost:8080/
```

### Container Management

```bash
# View status
podman ps --all

# View logs
podman logs augmentorai_server_1 --tail 50
podman logs augmentorai_web_1 --tail 50

# Restart
podman-compose restart server
podman-compose restart web

# Rebuild after code changes
podman-compose build server web
podman-compose up -d
```

### Auto-Restart Cron

A cron job runs every 5 minutes checking HTTP health of both containers. If a container is down, it auto-restarts via podman-compose. Only reports on failures.

Managed by Hermes cron: `augmentorai-auto-restart` (script: `container-auto-restart.py`).

---

## API Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| GET | /api/sessions | List all sessions |
| POST | /api/sessions | Create session |
| GET | /api/sessions/{id} | Get session details |
| DELETE | /api/sessions/{id} | Delete session + cascade |
| GET | /api/sessions/{id}/transcript | Get transcript chunks |
| GET | /api/sessions/{id}/answers | Get AI answers with confidence |
| POST | /api/sessions/{id}/generate-answer | Generate AI answer |
| POST | /api/sessions/{id}/switch-language | Update session language |
| GET | /api/settings | Get configuration |
| POST | /api/settings | Update configuration (API keys, model, etc.) |
| GET | /api/settings/models | List available models |
| GET | /api/analytics/stats | Aggregate statistics |
| WS | /ws/sessions/{id}/stream | Live transcription + answers |

### WebSocket Protocol

Messages from server:

```json
{"type": "transcript", "chunk": {"id": "...", "speaker": "...", "text": "...", "isQuestion": true, "timestamp": "..."}}
{"type": "answer", "answer": {"id": "...", "question": "...", "answer_text": "...", "confidence": 0.85, "provider": "gemini", "sources": "...", "transcriptChunkId": "..."}}
{"type": "confidence_update", "answerId": "...", "confidence": 0.85, "confidence_score": 0.85, "details": {"keyword_match": 0.9, "length": 0.8, "llm_eval": 0.85}, "provider": "gemini"}
{"type": "answer_error", "question": "...", "error": "..."}
```

---

## Configuration

### LLM Provider Priority

1. **Gemini** (requires GEMINI_API_KEY)
2. **DeepSeek** (requires DEEPSEEK_API_KEY, fallback if Gemini fails)
3. **Hermes API** (requires HERMES_API_KEY + HERMES_API_URL)
4. **Ollama local** (free, always available if Ollama container is running)

Users can set/change keys via the **Settings page** in the UI — no backend changes needed.

### Confidence Scoring

Three weighted factors (computed per answer):

| Factor | Weight | Method |
|--------|--------|--------|
| Keyword match | 40% | Compares answer keywords against question + context |
| Length normalization | 25% | Ideal range 50–300 words |
| Heuristic self-eval | 35% | Regex signals (numbers, structural words, action verbs) |

Confidence scores are cached per question hash (5-minute TTL).

---

## Development

### Backend

```bash
cd ~/projects/AugmentorAI

# Install with uv
cd server && uv sync && cd ..

# Run dev server (single-process, hot-reload)
uv run --directory server uvicorn app.main:app --host 0.0.0.0 --port 8010 --reload

# Run tests
cd server && uv run pytest -v
```

### Frontend

```bash
cd ~/projects/AugmentorAI

# Install deps
npm ci --legacy-peer-deps

# Dev server with hot-reload
npm run dev --workspace=web

# Production build
npm run build --workspace=web
```

---

## Key Files

| File | Purpose |
|------|---------|
| `server/app/main.py` | FastAPI app, router mounting, lifecycle |
| `server/app/api/sessions.py` | Session CRUD + answer generation |
| `server/app/api/websocket.py` | Real-time audio streaming + transcription |
| `server/app/api/analytics.py` | Aggregated stats endpoint |
| `server/app/api/settings.py` | Settings CRUD (API keys, model config) |
| `server/app/services/llm.py` | LLM provider abstraction layer |
| `server/app/services/session_ai.py` | Answer generation with RAG context |
| `server/app/services/confidence_scorer.py` | Confidence scoring algorithm |
| `server/app/services/rag.py` | ChromaDB RAG pipeline |
| `server/start.sh` | Entrypoint — pre-warm embeddings then gunicorn |
| `compose.yml` | Podman/Docker Compose configuration |
| `deploy/nginx.conf` | Production nginx reverse proxy template |
| `web/src/pages/LiveSession.tsx` | Live interview UI |
| `web/src/pages/TranscriptViewer.tsx` | Session replay viewer |

---

## Known Issues

1. **HEALTHCHECK warning:** Podman doesn't support HEALTHCHECK with OCI format — cosmetic only. The auto-restart cron handles actual monitoring.
2. **ChromaDB Posthog telemetry:** Monkey-patched to silence noise — no functional impact.
3. **SQLite concurrency:** Gunicorn workers share SQLite via WAL mode — adequate for moderate load.
4. **Nginx production deploy:** Blocked until `augmentor.digitalconcordia.com` domain is purchased + SSL configured.
