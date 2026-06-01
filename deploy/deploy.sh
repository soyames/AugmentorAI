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

echo "[1/6] Installing system dependencies..."
sudo dnf install -y nginx certbot python3-certbot-nginx

echo "[2/6] Setting up .env..."
if [ ! -f "${SERVER_DIR}/.env" ]; then
    cp "${DEPLOY_DIR}/.env.production" "${SERVER_DIR}/.env"
    echo "Created .env from .env.production template"
    echo "WARNING: Edit ${SERVER_DIR}/.env and add your DEEPSEEK_API_KEY!"
fi

echo "[3/6] Setting up systemd service..."
sudo cp "${DEPLOY_DIR}/augmentorai.service" /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable augmentorai

echo "[4/6] Setting up Nginx..."
sudo cp "${DEPLOY_DIR}/nginx.conf" "/etc/nginx/conf.d/${DOMAIN}.conf"
sudo sed -i "s/augmentor\.digitalconcordia\.com/${DOMAIN}/g" "/etc/nginx/conf.d/${DOMAIN}.conf"
sudo nginx -t && sudo systemctl reload nginx || echo "Nginx config needs fixing - check 'nginx -t'"

echo "[5/6] Getting SSL certificate (Let's Encrypt)..."
# Temporary: Certbot needs Nginx to run with a dummy cert or HTTP
# Run this manually once DNS points to this server:
#   sudo certbot --nginx -d ${DOMAIN}

echo "[6/6] Starting the service..."
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
echo "  1. Edit .env: sudo nano ${SERVER_DIR}/.env"
echo "  2. Get SSL:   sudo certbot --nginx -d ${DOMAIN}"
echo "  3. Build FE:  cd ${PROJECT_DIR}/web && npm run build"
echo "  4. Set CORS:  CORS_ORIGINS=https://${DOMAIN}"
echo "========================================="
