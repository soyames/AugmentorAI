# AugmentorAI

**Purpose:** AI-powered augmentation platform — interview analysis, transcription, RAG, and LLM-powered answers.

**Stack:** Python (FastAPI + uvicorn), DeepSeek API, Ollama fallback, ChromaDB (RAG), faster-whisper (transcription)

**Architecture:** 
- `server/` — FastAPI backend on port 8010 (26 routes)
- `web/` — Frontend (currently Node.js based; plan Flutter migration)
- `deploy/` — systemd unit, Nginx config, deploy script, .env.production template

**Conventions:**
- Python 3.11+ required (sqlite3 3.35+ for chromadb)
- numpy pinned to 1.26.4 (chromadb 0.4.22 breaks on numpy 2.x)
- Server runs via systemd user service: `augmentorai.service`
- Nginx proxies `inference.bintacura.org` to server on port 8010
- Never edit Django templates (Flutter is future UI)
- Never run migrations locally — use AWS SSM RunCommand on EC2 i-04028cf2c06f52abf

**Deployment:** Oracle Linux 9 VM, port 8010 (127.0.0.1), behind Nginx reverse proxy

**Status:** MVP complete. Backend verified working. Needs .venv recreated for Python 3.11 before production deploy.
