# AugmentorAI

AI-powered interview practice and preparation copilot.

## Features

- **Session Management** - Create and manage practice sessions
- **Document Upload** - Upload CV, job descriptions, and notes
- **Live Transcription** - Real-time speech-to-text during live discussions
- **Live AI Replies** - Incoming questions trigger immediate answer suggestions
- **join Live Meetings** - could be used on top of any live meetings(teams, zoom, etc) and will provide insight to you.

- **Question Detection** - Automatically identify questions
- **save notes** from live sessions.
- **Answer Suggestions** - AI-generated responses grounded in both own knowlege but also the documents
- **Multi-language Support** - Switch languages during sessions
- **Transcript Export** - Save and review your practice sessions

## Tech Stack

- **Frontend**: React + Vite + TypeScript + Tailwind + Zustand
- **Desktop**: Electron
- **Backend**: FastAPI + SQLite + WebSocket
- **AI**: Gemini + DeepSeek + Ollama + faster-whisper + ChromaDB

## Project Structure

```
AugmentorAI/
├── web/          # React web application
├── desktop/      # Electron desktop app
├── server/       # FastAPI backend
├── ai/           # AI modules (transcription, retrieval, generation)
├── shared/       # Shared types and utilities
├── docs/         # Documentation
├── scripts/      # Build and utility scripts
└── data/         # Local database and files
```

## Getting Started

### Prerequisites

- Node.js 18+
- Python 3.10+
- uv 0.10+
- Gemini API key for primary cloud inference
- DeepSeek API key for secondary cloud inference
- Ollama (for local LLM fallback)

### Installation

1. Clone the repository
2. Install dependencies:

```bash
# Install Node dependencies
npm install

# Set up Python environment
uv sync --project server
```

3. Add cloud LLM keys from the app Settings screen after the server starts.

The Settings screen stores Gemini and DeepSeek keys on the server and never sends stored key values back to the browser.

4. Start Ollama and pull a model for fallback:

```bash
ollama pull llama3.1
```

5. Run the application:

```bash
# Start both server and web app
npm start
```

The `npm start` command uses `uv run --project server` for the backend on port `8010`.
If port `8010` is already in use, stop the existing process and run `npm start` again.

### LLM fallback order

AugmentorAI now tries providers in this order:

1. Gemini
2. DeepSeek
3. Ollama

If Gemini or DeepSeek runs out of quota or tokens, the app automatically falls through to the next provider.

## Database Configuration

By default, AugmentorAI uses local SQLite under `server/data/augmentor.db`.
To use PostgreSQL, set `DATABASE_URL` before starting:

```powershell
$env:DATABASE_URL="postgresql+psycopg2://username:password@host:5432/augmentorai"
npm start
```

## Containers

The app can run fully containerized with Docker Compose or Podman Compose. The backend image runs Python 3.12 and contains the Python/Whisper/Chroma dependencies, the web image serves the React build through nginx, and named volumes keep SQLite, uploads, Chroma data, Whisper cache, and Ollama models outside the images.

```bash
# Docker
docker compose up --build -d

# Podman
podman compose up --build -d
```

Open `http://localhost:8080`. API is also exposed on `http://localhost:8010`.

Persistent volumes:

- `augmentor-server-data` mounted at `/app/server/data`
- `augmentor-ollama` mounted at `/root/.ollama`

Cloud LLM keys are still added from the app Settings screen, not baked into images.

The Ollama service uses `pull_policy: missing`, so Docker/Podman reuses the existing local `alpine/ollama:latest` image before trying to pull anything. If your image has a different local tag, set it before starting:

```bash
export AUGMENTOR_OLLAMA_IMAGE=your-local-ollama-image:tag
```

To use images built by GitHub Actions:

```bash
export AUGMENTOR_SERVER_IMAGE=ghcr.io/soyames/augmentorai/server:latest
export AUGMENTOR_WEB_IMAGE=ghcr.io/soyames/augmentorai/web:latest
export AUGMENTOR_CORS_ORIGINS=https://your-domain.example

docker compose -f compose.prod.yml pull server web
docker compose -f compose.prod.yml up -d
```

Use the same commands with `podman compose` on a Podman host.

## License

MIT
