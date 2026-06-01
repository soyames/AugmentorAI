# AugmentorAI

AI-powered interview practice and preparation copilot.

## Features

- **Session Management** - Create and manage practice sessions
- **Document Upload** - Upload CV, job descriptions, and notes
- **Live Transcription** - Real-time speech-to-text during practice
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
- **AI**: Ollama + faster-whisper + ChromaDB

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
- Ollama (for local LLM)

### Installation

1. Clone the repository
2. Install dependencies:

```bash
# Install Node dependencies
npm install

# Set up Python environment
cd server
python -m venv .venv
.venv\Scripts\activate  # Windows
pip install -r requirements.txt
```

**Note on Windows**: On Windows, use `pip install` rather than `uv pip install` due to binary compilation requirements for `av` and `chroma-hnswlib` packages.

3. Start Ollama and pull a model:

```bash
ollama pull llama3.1
```

4. Run the application:

```bash
# Start both server and web app
npm start
```

The `npm start` command uses `server\.venv\Scripts\python.exe` for the backend on Windows on port `8010`.
If port `8010` is already in use, stop the existing process and run `npm start` again.

## Database Configuration

By default, AugmentorAI uses local SQLite under `server/data/augmentor.db`.
To use PostgreSQL, set `DATABASE_URL` before starting:

```powershell
$env:DATABASE_URL="postgresql+psycopg2://username:password@host:5432/augmentorai"
npm start
```

## License

MIT
