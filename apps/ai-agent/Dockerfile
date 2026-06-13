# --- Build Stage ---
FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim AS builder

# Enable bytecode compilation
ENV UV_COMPILE_BYTECODE=1

# Copy from the cache instead of linking since it's a multi-stage build
ENV UV_LINK_MODE=copy

WORKDIR /app

# Mount cache for faster dependency downloads and sync packages
RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=uv.lock,target=uv.lock \
    --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    uv sync --frozen --no-install-project --no-dev

# Copy the application source code
COPY . .

# Build the virtual environment without dev dependencies
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev

# --- Production Runtime Stage ---
FROM python:3.13-slim-bookworm

WORKDIR /app

# Create folder for persistent databases
RUN mkdir -p /app/data

# Copy virtual environment and app code from builder stage
COPY --from=builder /app /app

# Add virtual environment to PATH
ENV PATH="/app/.venv/bin:$PATH"
ENV HOST=0.0.0.0
ENV PORT=8000
ENV DATABASE_URL="sqlite+aiosqlite:///app/data/sessions.db"

# Expose FastAPI API port
EXPOSE 8000

# Start FastAPI application with Uvicorn
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
