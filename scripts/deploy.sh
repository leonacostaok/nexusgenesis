#!/bin/bash
set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}"
echo "============================================"
echo "  NexusGenesis - Production Deploy Script"
echo "============================================"
echo -e "${NC}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

usage() {
    echo "Usage: $0 [docker|bare|pull]"
    echo ""
    echo "  docker  - Deploy using Docker Compose (recommended)"
    echo "  bare    - Deploy directly with Node.js and PM2"
    echo "  pull    - Just pull latest code and restart"
    exit 1
}

deploy_docker() {
    echo -e "${YELLOW}[1/5] Pulling latest code...${NC}"
    cd "$PROJECT_DIR"
    git pull origin master

    echo -e "${YELLOW}[2/5] Stopping existing containers...${NC}"
    docker compose -f docker-compose.prod.yml down 2>/dev/null || true

    echo -e "${YELLOW}[3/5] Pulling latest images...${NC}"
    docker compose -f docker-compose.prod.yml pull

    echo -e "${YELLOW}[4/5] Starting services...${NC}"
    docker compose -f docker-compose.prod.yml up -d

    echo -e "${YELLOW}[5/5] Verifying deployment...${NC}"
    sleep 8
    if curl -sf http://localhost:19891/health > /dev/null; then
        echo -e "${GREEN}✓ NexusGenesis backend is running!${NC}"
    else
        echo -e "${RED}✗ Backend health check failed${NC}"
    fi

    if curl -sf http://localhost/ > /dev/null; then
        echo -e "${GREEN}✓ Nginx frontend is running!${NC}"
    else
        echo -e "${RED}✗ Frontend check failed${NC}"
    fi

    echo ""
    echo -e "${GREEN}============================================"
    echo "  Deployment Complete!"
    echo "  Backend: http://nexus-genesis.top:19891"
    echo "  Frontend: http://nexus-genesis.top"
    echo "  Health: http://nexus-genesis.top/health"
    echo "============================================"
    echo -e "${NC}"
}

deploy_bare() {
    echo -e "${YELLOW}[1/4] Pulling latest code...${NC}"
    cd "$PROJECT_DIR"
    git pull origin master

    echo -e "${YELLOW}[2/4] Installing dependencies...${NC}"
    npm ci --only=production

    echo -e "${YELLOW}[3/4] Restarting with PM2...${NC}"
    if command -v pm2 &>/dev/null; then
        pm2 delete nexusgenesis 2>/dev/null || true
        pm2 start src/index.js --name nexusgenesis --max-memory-restart 2G
        pm2 save
    else
        echo -e "${RED}PM2 not installed. Install with: npm i -g pm2${NC}"
        echo "Starting with node directly (not recommended for production)..."
        nohup node src/index.js > logs/server.log 2>&1 &
    fi

    echo -e "${YELLOW}[4/4] Verifying deployment...${NC}"
    sleep 5
    if curl -sf http://localhost:19891/health > /dev/null; then
        echo -e "${GREEN}✓ NexusGenesis is running!${NC}"
    else
        echo -e "${RED}✗ Health check failed${NC}"
    fi
}

deploy_pull() {
    echo -e "${YELLOW}Pulling latest code...${NC}"
    cd "$PROJECT_DIR"
    git pull origin master

    echo -e "${YELLOW}Restarting existing container...${NC}"
    docker compose -f docker-compose.prod.yml restart

    echo -e "${GREEN}✓ Restarted!${NC}"
}

if [ $# -eq 0 ]; then
    usage
fi

case "$1" in
    docker) deploy_docker ;;
    bare)   deploy_bare ;;
    pull)   deploy_pull ;;
    *)      usage ;;
esac