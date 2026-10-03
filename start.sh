#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MOSIP_STACK_DIR="${HOME}/mosip-repos/inji-certify/docker-compose/docker-compose-injistack"

if ! command -v docker &> /dev/null; then
    echo "Error: docker is not installed or not in PATH."
    exit 1
fi

if [ -d "$MOSIP_STACK_DIR" ]; then
    (cd "$MOSIP_STACK_DIR" && docker compose up -d)
fi

cd "${SCRIPT_DIR}/backend"
if [ ! -d "node_modules" ]; then
    npm install
fi
npm run build
pkill -f "node dist/index.js" || true
npm start &
BACKEND_PID=$!

cd "${SCRIPT_DIR}/frontend"
if [ ! -d "node_modules" ]; then
    npm install
fi
npm run build
pkill -f "vite --host --port 5173" || true
npx vite --host --port 5173 &
FRONTEND_PID=$!

wait $FRONTEND_PID $BACKEND_PID
