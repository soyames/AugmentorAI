#!/usr/bin/env bash
# AugmentorAI — deployment script for custom server setup
# Run as: sudo bash deploy/deploy.sh [your-domain.com]
#
# For local Docker/Podman: just run `docker compose up --build -d`
# This script is only needed for bare-metal/production server deployment.
set -euo pipefail

echo "========================================="
echo "  AugmentorAI — Production Deploy"
echo "========================================="

# ---- Config ----
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SERVER_DIR="${PROJECT_DIR}/server"
DEPLOY_DIR="${PROJECT_DIR}/deploy"
DOMAIN="${1:-localhost}"

echo "[1/7] Installing system dependencies..."
sudo dnf install -y nginx certbot python3-certbot-nginx curl

echo "[2/7] Setting up .env..."
if [ ! -f "${SERVER_DIR}/.env" ]; then
    cp "${PROJECT_DIR}/.env.example" "${SERVER_DIR}/.env"
    echo "Created .env from .env.example template"
    echo "Edit ${SERVER_DIR}/.env with your API keys."
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
sudo cp "${DEPLOY_DIR}/nginx.conf" "/etc/nginx/conf.d/augmentor.conf"
sudo sed -i "s/server_name localhost;/server_name ${DOMAIN};/g" "/etc/nginx/conf.d/augmentor.conf"
sudo nginx -t && sudo systemctl reload nginx || echo "Nginx config needs fixing - check 'nginx -t'"

echo "[6/7] Getting SSL certificate (Let's Encrypt)..."
if [ "${DOMAIN}" != "localhost" ]; then
    sudo certbot --nginx -d "${DOMAIN}" || echo "Certbot failed — run manually later"
fi

echo "[7/7] Starting the service..."
sudo systemctl start augmentorai
sudo systemctl status augmentorai --no-pager

echo ""
echo "========================================="
echo "  Deploy complete!"
echo "  API:    http://${DOMAIN}/api/"
echo "  Health: http://${DOMAIN}/health"
echo "  Web:    http://${DOMAIN}/"
echo ""
echo "  For Docker/Podman local use:"
echo "    docker compose up --build -d"
echo ""
echo "  Next steps:"
echo "  1. Add LLM keys: open the app Settings screen"
echo "  2. Get SSL:   sudo certbot --nginx -d ${DOMAIN}"
echo "  3. Build FE:  cd ${PROJECT_DIR}/web && npm run build"
echo "========================================="
