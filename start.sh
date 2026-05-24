#!/usr/bin/env bash
# Aletheia — single-command launcher (Mac/Linux)
# Usage: ./start.sh

set -e
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
ok()   { echo -e "${GREEN}  ✓${NC} $1"; }
warn() { echo -e "${YELLOW}  !${NC} $1"; }
err()  { echo -e "${RED}  ✗${NC} $1"; }
info() { echo -e "${CYAN}  →${NC} $1"; }

echo ""
echo -e "${CYAN}╔══════════════════════════════════╗${NC}"
echo -e "${CYAN}║        Aletheia  Launcher        ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════╝${NC}"
echo ""

# ── 1. Check / install uv ────────────────────────────────────────────────────
if ! command -v uv &>/dev/null; then
  warn "uv not found — installing..."
  curl -LsSf https://astral.sh/uv/install.sh | sh
  export PATH="$HOME/.local/bin:$PATH"
fi
ok "uv $(uv --version | cut -d' ' -f2)"

# ── 2. Backend deps (uv sync) ────────────────────────────────────────────────
info "Syncing backend dependencies..."
cd "$BACKEND"
uv sync --quiet
ok "Backend deps ready"

# ── 3. .env ──────────────────────────────────────────────────────────────────
if [ ! -f "$BACKEND/.env" ]; then
  cp "$BACKEND/.env.example" "$BACKEND/.env"
  ok "Created backend/.env from example"
fi

# ── 4. Frontend deps ─────────────────────────────────────────────────────────
if [ ! -d "$FRONTEND/node_modules" ]; then
  info "Installing frontend dependencies..."
  cd "$FRONTEND" && npm install --silent
  ok "Frontend deps ready"
else
  ok "Frontend deps already installed"
fi

# ── 5. Ollama models ─────────────────────────────────────────────────────────
if ! command -v ollama &>/dev/null; then
  err "Ollama not found. Install from https://ollama.ai then re-run."
  exit 1
fi

for model in "qwen3:4b" "nomic-embed-text"; do
  if ollama list 2>/dev/null | grep -q "^${model}"; then
    ok "Model: $model"
  else
    info "Pulling $model (this may take a while)..."
    ollama pull "$model"
    ok "Model: $model"
  fi
done

# ── 6. Qdrant (Docker, optional) ─────────────────────────────────────────────
if command -v docker &>/dev/null && docker info &>/dev/null 2>&1; then
  cd "$ROOT"
  docker compose up qdrant -d --quiet-pull 2>/dev/null && ok "Qdrant started" || warn "Qdrant failed to start (chat still works without it)"
else
  warn "Docker not running — Qdrant skipped (RAG/memory disabled)"
fi

# ── 7. Launch ────────────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}Starting services...${NC}"
echo ""

cd "$BACKEND"
uv run uvicorn app.main:app --port 8000 &
BACKEND_PID=$!

cd "$FRONTEND"
npm run dev &
FRONTEND_PID=$!

sleep 3
echo ""
echo -e "${GREEN}  Aletheia is running!${NC}"
echo ""
echo "  Frontend  →  http://localhost:3000"
echo "  Backend   →  http://localhost:8000"
echo "  API docs  →  http://localhost:8000/docs"
echo ""
echo "  Press Ctrl+C to stop all services"
echo ""

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" SIGINT SIGTERM
wait
