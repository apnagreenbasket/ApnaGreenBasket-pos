#!/bin/bash
# ============================================================
# Production Deployment Script — ApnaGreen Basket
# ============================================================
# Usage:
#   First-time server setup:  ./deploy.sh --init
#   SSL certificate setup:    ./deploy.sh --ssl
#   Deploy/Update app:        ./deploy.sh
#   View container logs:      ./deploy.sh --logs
#   Check health & status:    ./deploy.sh --status
#   Restart all services:     ./deploy.sh --restart
#   Stop all services:        ./deploy.sh --stop
# ============================================================

set -euo pipefail

# --- CONFIGURATION (Update domain & email for your live environment) ---
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOMAIN_WEB="app.apnagreenbasket.com"
DOMAIN_API="api.apnagreenbasket.com"
EMAIL="official@apnagreenbasket.com"

BACKEND_CONTAINER="agb-backend"
API_HEALTH_URL="http://localhost:8000/health"

# Colors for terminal output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${GREEN}✅ $1${NC}"; }
warn() { echo -e "${YELLOW}⚠️  $1${NC}"; }
info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
error() { echo -e "${RED}❌ $1${NC}"; exit 1; }

# ============================================================
# 1. First-Time Server Setup (--init)
# ============================================================
init_server() {
    echo "============================================================"
    echo "🚀 Initial Server Setup (AWS EC2 / Ubuntu)"
    echo "============================================================"

    log "Updating system packages..."
    sudo apt-get update && sudo apt-get upgrade -y

    # 1. Swap Space (Prevents OOM during builds/pip installs on 2GB t4g.small)
    if ! swapon --show | grep -q "/swapfile"; then
        info "Creating 2GB swapfile to protect against memory exhaustion during builds..."
        sudo fallocate -l 2G /swapfile || sudo dd if=/dev/zero of=/swapfile bs=1M count=2048
        sudo chmod 600 /swapfile
        sudo mkswap /swapfile
        sudo swapon /swapfile
        echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
        log "2GB Swap space created successfully."
    else
        log "Swap space already active."
    fi

    # 2. Install Docker
    if ! command -v docker &> /dev/null; then
        log "Installing Docker..."
        curl -fsSL https://get.docker.com | sh
        sudo usermod -aG docker "$USER"
        warn "Docker installed. Log out and reconnect if running without sudo."
    else
        log "Docker is already installed."
    fi

    # 3. Install Docker Compose plugin
    if ! docker compose version &> /dev/null; then
        log "Installing Docker Compose plugin..."
        sudo apt-get install -y docker-compose-plugin
    else
        log "Docker Compose is already installed."
    fi

    # 4. Install Certbot
    if ! command -v certbot &> /dev/null; then
        log "Installing Certbot..."
        sudo apt-get install -y certbot
    else
        log "Certbot is already installed."
    fi

    # 5. Install AWS CLI (used for S3 automated backups)
    if ! command -v aws &> /dev/null; then
        log "Installing AWS CLI..."
        sudo snap install aws-cli --classic 2>/dev/null || sudo apt-get install -y awscli 2>/dev/null || true
    fi

    # 6. Create production directories
    mkdir -p "$PROJECT_DIR/nginx/ssl"
    mkdir -p "$PROJECT_DIR/nginx/certbot-webroot"
    mkdir -p "$PROJECT_DIR/certs"
    mkdir -p "$PROJECT_DIR/uploads"
    chmod 755 "$PROJECT_DIR/uploads"

    # 7. Download official AWS RDS Global Root CA bundle
    if [ ! -f "$PROJECT_DIR/certs/rds-ca-bundle.pem" ]; then
        log "Downloading AWS RDS Global Root CA bundle..."
        curl -sSL -o "$PROJECT_DIR/certs/rds-ca-bundle.pem" https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem
    fi

    # 8. Check for .env file
    if [ ! -f "$PROJECT_DIR/.env" ]; then
        warn "No .env file found in project root!"
        warn "Copy .env.production.example to .env and configure production credentials:"
        warn "  cp .env.production.example .env"
        exit 1
    fi

    log "First-time server setup complete!"
    echo ""
    echo "Next steps:"
    echo "  1. Point your DNS A-record for $DOMAIN_API to this server's Elastic IP."
    echo "     (Point $DOMAIN_WEB CNAME to Vercel: cname.vercel-dns.com)"
    echo "  2. Run: ./deploy.sh --ssl     (to generate Let's Encrypt certificate for API)"
    echo "  3. Run: ./deploy.sh           (to build, migrate, and start backend services)"
}

# ============================================================
# 2. SSL Certificate Setup (--ssl)
# ============================================================
setup_ssl() {
    echo "============================================================"
    echo "🔒 SSL Certificate Setup (Let's Encrypt Dual-Domain)"
    echo "============================================================"

    mkdir -p "$PROJECT_DIR/nginx/ssl"
    mkdir -p "$PROJECT_DIR/nginx/certbot-webroot"

    # Stop nginx temporarily to free port 80 for standalone ACME challenge
    docker compose -f "$PROJECT_DIR/docker-compose.yml" stop nginx 2>/dev/null || true

    log "Requesting SSL certificate for: ${DOMAIN_API}..."
    sudo certbot certonly \
        --standalone \
        --non-interactive \
        --agree-tos \
        --email "$EMAIL" \
        -d "$DOMAIN_API"

    # Primary cert directory
    CERT_DIR="/etc/letsencrypt/live/${DOMAIN_API}"
    if [ ! -d "$CERT_DIR" ]; then
        CERT_DIR=$(sudo find /etc/letsencrypt/live/ -maxdepth 1 -mindepth 1 -type d | head -n 1)
    fi

    # Copy certificates to project nginx volume
    sudo cp "${CERT_DIR}/fullchain.pem" "$PROJECT_DIR/nginx/ssl/fullchain.pem"
    sudo cp "${CERT_DIR}/privkey.pem" "$PROJECT_DIR/nginx/ssl/privkey.pem"
    sudo chmod 644 "$PROJECT_DIR/nginx/ssl/fullchain.pem"
    sudo chmod 600 "$PROJECT_DIR/nginx/ssl/privkey.pem"

    # Configure daily auto-renewal cron job
    CRON_CMD="0 3 * * * certbot renew --quiet && cp ${CERT_DIR}/fullchain.pem ${PROJECT_DIR}/nginx/ssl/fullchain.pem && cp ${CERT_DIR}/privkey.pem ${PROJECT_DIR}/nginx/ssl/privkey.pem && docker compose -f ${PROJECT_DIR}/docker-compose.yml restart nginx"
    (sudo crontab -l 2>/dev/null | grep -v "certbot renew"; echo "$CRON_CMD") | sudo crontab -

    log "SSL certificates installed and daily auto-renewal configured!"
}

# ============================================================
# 3. Application Deployment & Zero-Downtime Migrations
# ============================================================
deploy() {
    echo "============================================================"
    echo "🚀 Deploying ApnaGreen Basket"
    echo "============================================================"

    cd "$PROJECT_DIR"

    [ -f ".env" ] || error ".env file not found. Run ./deploy.sh --init first."
    [ -f "nginx/ssl/fullchain.pem" ] || error "SSL certificates not found in nginx/ssl/. Run ./deploy.sh --ssl first."
    [ -f "certs/rds-ca-bundle.pem" ] || curl -sSL -o certs/rds-ca-bundle.pem https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem

    # Step 1: Pull latest code from GitHub
    log "Pulling latest code from GitHub..."
    git pull origin main

    # Step 2: Build production backend image
    log "Building Docker image (FastAPI Backend)..."
    docker compose build backend

    # Step 3: Run Alembic migrations against AWS RDS before switching traffic
    log "Running database migrations against AWS RDS..."
    docker compose run --rm backend alembic upgrade head

    # Step 4: Recreate services cleanly
    log "Starting / restarting containers..."
    docker compose up -d --force-recreate

    # Step 5: Wait and verify health checks
    log "Waiting for backend container to report healthy..."
    sleep 5

    # Check Backend API health
    if docker exec "$BACKEND_CONTAINER" curl -sf "$API_HEALTH_URL" > /dev/null 2>&1; then
        log "Backend API health check passed! ✅"
    else
        warn "Backend health check failed. Showing container logs:"
        docker compose logs --tail=50 backend
        exit 1
    fi

    # Step 6: Prune build cache to maintain EBS disk space
    docker system prune -f 2>/dev/null || true
    docker builder prune -a -f 2>/dev/null || true

    echo ""
    echo "============================================================"
    log "🎉 ApnaGreen Basket Backend deployed successfully!"
    echo "   Backend API:   https://${DOMAIN_API}"
    echo "   Health Check:  https://${DOMAIN_API}/health"
    echo "   Frontend Web:  https://${DOMAIN_WEB} (Hosted on Vercel)"
    echo "============================================================"
}

# ============================================================
# Main Entry Point
# ============================================================
case "${1:-}" in
    --init)    init_server ;;
    --ssl)     setup_ssl ;;
    --logs)    docker compose logs -f --tail=100 ;;
    --status)
        docker compose ps
        echo ""
        info "API Health:"
        docker exec "$BACKEND_CONTAINER" curl -s "$API_HEALTH_URL" | python3 -m json.tool 2>/dev/null || warn "Backend not responding"
        echo ""
        info "Frontend (Vercel):"
        echo "   Domain: https://${DOMAIN_WEB}"
        ;;
    --restart) docker compose restart ;;
    --stop)    docker compose down ;;
    *)         deploy ;;
esac
