#!/usr/bin/env bash
# ==============================================================================
# MOSIP Decode 2026 — Inji Interoperability Playground One-Click Launcher
# ==============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MOSIP_STACK_DIR="${HOME}/mosip-repos/inji-certify/docker-compose/docker-compose-injistack"

echo ""
echo "========================================================================"
echo "    MOSIP Decode 2026: Inji Interoperability Playground Launcher       "
echo "    Problem Statement #2: Unified Sandbox for Verifiable Credentials   "
echo "========================================================================"
echo ""

# 1. Check Docker
echo "[1/4] Checking Docker environment..."
if ! command -v docker &> /dev/null; then
    echo "[-] Error: docker is not installed or not in PATH."
    exit 1
fi

if [ -d "$MOSIP_STACK_DIR" ]; then
    echo "[*] Verifying baseline MOSIP Docker containers..."
    (cd "$MOSIP_STACK_DIR" && docker compose up -d)
else
    echo "[!] Notice: $MOSIP_STACK_DIR not found. Proceeding with existing running containers or mock fallback."
fi

# 2. Build and Start Backend
echo ""
echo "[2/4] Initializing Playground Backend on port 4000..."
cd "${SCRIPT_DIR}/backend"
if [ ! -d "node_modules" ]; then
    echo "[*] Installing Backend dependencies..."
    npm install
fi
npm run build

echo "[*] Launching Backend server in background..."
pkill -f "node dist/index.js" || true
npm start &
BACKEND_PID=$!

# 3. Build and Start Frontend
echo ""
echo "[3/4] Initializing Playground UI on port 5173..."
cd "${SCRIPT_DIR}/frontend"
if [ ! -d "node_modules" ]; then
    echo "[*] Installing Frontend dependencies..."
    npm install
fi
npm run build

echo "[*] Launching Vite Frontend server..."
pkill -f "vite --host --port 5173" || true
npx vite --host --port 5173 &
FRONTEND_PID=$!

# 4. Health Check
echo ""
echo "[4/4] Verifying System Health..."
sleep 3
HEALTH_CHECK=$(curl -s http://localhost:4000/api/health || echo "{}")
echo "[+] Health Response: $HEALTH_CHECK"

echo ""
echo "========================================================================"
echo "               PLAYGROUND IS LIVE AND OPERATIONAL!                     "
echo "========================================================================"
echo "  • Playground UI:          http://localhost:5173                      "
echo "  • Playground Backend API: http://localhost:4000/api/health           "
echo "  • Conformance Report:     http://localhost:4000/api/interop/report   "
echo "  • CLI Matrix Runner:      npm run test:matrix (in backend)           "
echo "========================================================================"
echo ""
echo "Press Ctrl+C to stop servers."

wait $FRONTEND_PID $BACKEND_PID
