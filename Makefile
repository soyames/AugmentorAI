.PHONY: test test-verbose test-coverage lint clean

# Run all tests (from server directory with its venv)
test:
	cd server && uv run pytest tests/ -x --tb=short -q

# Run tests with verbose output
test-verbose:
	cd server && uv run pytest tests/ -v --tb=short

# Run tests with coverage report
test-coverage:
	cd server && uv run pytest tests/ --cov=app --cov-report=term-missing

# Lint with ruff
lint:
	cd server && uv run ruff check app/ tests/

# Clean Python caches
clean:
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete
