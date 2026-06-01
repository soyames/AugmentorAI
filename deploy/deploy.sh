#!/usr/bin/env bash
# AugmentorAI — production deployment script for Oracle VM
# Run as: sudo bash deploy/deploy.sh
# This script sets up the full stack: backend, Nginx, SSL, CORS
set -euo pipefail

echo "========================================="
echo "  AugmentorAI — Production Deploy"
echo "========================================="

# ---- Config ----
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SERVER_DIR="${PROJECT_DIR}/server"
DEPLOY_DIR="${PROJECT_DIR}/deploy"
DOMAIN="${1:-augmentor.digitalconcordia.com}"

echo "[1/7] Installing system dependencies..."
sudo dnf install -y nginx certbot python3-certbot-nginx curl

echo "[2/7] Setting up .env..."
if [ ! -f "${SERVER_DIR}/.env" ]; then
    cp "${DEPLOY_DIR}/.env.production" "${SERVER_DIR}/.env"
    echo "Created .env from .env.production template"
    echo "Add Gemini and DeepSeek API keys from the in-app Settings screen after deploy."
fi

echo "[3/7] Syncing Python dependencies with uv..."
if ! command -v uv >/dev/null 2>&1; then
    curl -LsSf https://astral.sh/uv/install.sh | sh
    export PATH="${HOME}/.local/bin:${PATH}"
fi
uv sync --project "${SERVER_DIR}" --frozen

echo "[4/7] Setting up systemd service..."
sudo cp "${DEPLOY_DIR}/augmentorai.service" /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable augmentorai

echo "[5/7] Setting up Nginx..."
sudo cp "${DEPLOY_DIR}/nginx.conf" "/etc/nginx/conf.d/${DOMAIN}.conf"
sudo sed -i "s/augmentor\.digitalconcordia\.com/${DOMAIN}/g" "/etc/nginx/conf.d/${DOMAIN}.conf"
sudo nginx -t && sudo systemctl reload nginx || echo "Nginx config needs fixing - check 'nginx -t'"

echo "[6/7] Getting SSL certificate (Let's Encrypt)..."
# Temporary: Certbot needs Nginx to run with a dummy cert or HTTP
# Run this manually once DNS points to this server:
#   sudo certbot --nginx -d ${DOMAIN}

echo "[7/7] Starting the service..."
sudo systemctl start augmentorai
sudo systemctl status augmentorai --no-pager

echo ""
echo "========================================="
echo "  Deploy complete!"
echo "  API:    https://${DOMAIN}/api/"
echo "  Health: https://${DOMAIN}/health"
echo "  Web:    https://${DOMAIN}/"
echo ""
echo "  Next steps:"
echo "  1. Add LLM keys: open the app Settings screen"
echo "  2. Get SSL:   sudo certbot --nginx -d ${DOMAIN}"
echo "  3. Build FE:  cd ${PROJECT_DIR}/web && npm run build"
echo "  4. Set CORS:  CORS_ORIGINS=https://${DOMAIN}"
echo "========================================="
