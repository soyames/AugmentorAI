# Contributing to AugmentorAI

First off, thank you for considering contributing to AugmentorAI! We welcome and value community contributions.

## Development Environment Setup

AugmentorAI uses a monorepo structure with a React/Vite frontend (`web/`) and a Python/FastAPI backend (`server/`).

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+)
- [Python](https://www.python.org/) (v3.12)
- [uv](https://github.com/astral-sh/uv) (Python package manager)

### 1. Frontend Setup
Navigate to the `web/` directory and install dependencies:
```bash
cd web
npm install
```
Start the frontend development server:
```bash
npm run dev
```

### 2. Backend Setup
Navigate to the `server/` directory. `uv` is used for fast dependency management.
```bash
cd server
uv sync
```
Start the backend server (FastAPI):
```bash
uv run uvicorn app.main:app --reload --port 8010
```

*Alternatively, from the project root, you can run `npm run start` to start both via concurrently.*

## Branching Strategy
- Always create a new branch for your work.
- Use a descriptive naming convention: `feature/your-feature-name`, `bugfix/issue-description`, or `docs/update-readme`.
- Never commit directly to the `main` branch.

## Code Standards

### Python / FastAPI
- **Docstrings are Mandatory**: **All FastAPI endpoints must include comprehensive docstrings.** Explain what the endpoint does, expected inputs, and possible outputs/errors.
- Run `pytest` locally to ensure no tests are broken before submitting a PR.
- Use type hinting (`def get_item(item_id: int) -> dict:`) strictly.

### React / TypeScript
- Use TypeScript for all new files.
- Ensure your code passes linting: run `npm run lint` inside the `web/` directory.
- Use functional components and hooks.

## Submitting a Pull Request
1. Commit your changes locally and push your branch to GitHub.
2. Open a Pull Request against the `main` branch.
3. Fill out the provided Pull Request Template completely.
4. **Automated CI/CD**: Once you open the PR, our GitHub Actions will automatically run:
   - Frontend linting and build tests.
   - Backend Python tests.
5. A maintainer will review your code. You may be asked to make changes before it can be merged.

Thank you for contributing to AugmentorAI!
