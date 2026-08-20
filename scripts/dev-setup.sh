#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "✨ Clearweb Health dev setup"

if [ ! -f "$ROOT/backend/.env" ]; then
  cp "$ROOT/backend/.env.example" "$ROOT/backend/.env"
  echo "Created backend/.env"
fi

if [ ! -f "$ROOT/frontend/.env.local" ]; then
  cp "$ROOT/frontend/.env.example" "$ROOT/frontend/.env.local"
  echo "Created frontend/.env.local"
fi

cd "$ROOT/backend" && npm install
cd "$ROOT/frontend" && npm install

if [ -f "$ROOT/scripts/setup-brightdata.sh" ]; then
  bash "$ROOT/scripts/setup-brightdata.sh"
fi

echo ""
echo "Next steps:"
echo "  1. ollama serve"
echo "  2. ollama pull llama3.1:8b"
echo "  3. cd backend && npm run dev    # preloads local Whisper STT on startup"
echo "  4. cd frontend && npm run dev"
echo "  5. curl http://localhost:3001/api/health"
