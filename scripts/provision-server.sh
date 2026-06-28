#!/bin/bash
# ===============================================
#  NexusGenesis Mainnet Server Provisioning Script
#  Version: 1.0.0
# 
#  Usage:
#    SEED_INDEX=1 bash scripts/provision-server.sh
#    ROLE=validator VALIDATOR_NAME="MyVal" STAKE=100000 bash scripts/provision-server.sh
# ===============================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}[INFO]${NC}  $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step()  { echo -e "\n${BLUE}[STEP]${NC} $1"; }

ROLE=${ROLE:-seed}
SEED_INDEX=${SEED_INDEX:-1}
VALIDATOR_NAME=${VALIDATOR_NAME:-"validator-$(date +%s)"}
STAKE=${STAKE:-100000}
SERVER_HOSTNAME=${SERVER_HOSTNAME:-$(hostname)}
DOMAIN_BASE=${DOMAIN_BASE:-"nexus-genesis.top"}

echo "========================================"
echo " NexusGenesis Mainnet Server Provisioner"
echo "========================================"
echo ""
echo " Role:     $ROLE"
if [ "$ROLE" = "seed" ]; then
  SERVER_DOMAIN="seed${SEED_INDEX}.${DOMAIN_BASE}"
  P2P_PORT=9847
  HTTP_PORT=19890
  echo " Domain:   $SERVER_DOMAIN"
  echo " Index:    $SEED_INDEX"
elif [ "$ROLE" = "validator" ]; then
  SERVER_DOMAIN="${VALIDATOR_NAME}.${DOMAIN_BASE}"
  P2P_PORT=9848
  HTTP_PORT=19891
  echo " Name:     $VALIDATOR_NAME"
  echo " Stake:    $STAKE NGEN"
else
  P2P_PORT=9849
  HTTP_PORT=19892
fi
echo ""

log_step "1/10: Installing system dependencies"
if command -v apt-get &> /dev/null; then
  sudo apt-get update -qq
  sudo apt-get install -y -qq curl wget git build-essential openssl ufw fail2ban
elif command -v yum &> /dev/null; then
  sudo yum install -y -q curl wget git gcc-c++ make openssl
fi

log_step "2/10: Installing Docker"
if ! command -v docker &> /dev/null; then
  curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
  sudo sh /tmp/get-docker.sh > /dev/null 2>&1
  sudo usermod -aG docker $USER
fi

if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null 2>&1; then
  sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
  sudo chmod +x /usr/local/bin/docker-compose
fi

log_step "3/10: Configuring firewall"
if command -v ufw &> /dev/null; then
  sudo ufw allow 22/tcp
  sudo ufw allow 80/tcp
  sudo ufw allow 443/tcp
  sudo ufw allow ${P2P_PORT}/tcp
  sudo ufw allow ${HTTP_PORT}/tcp
  sudo ufw --force enable
elif command -v firewall-cmd &> /dev/null; then
  sudo firewall-cmd --permanent --add-port=${P2P_PORT}/tcp
  sudo firewall-cmd --permanent --add-port=${HTTP_PORT}/tcp
  sudo firewall-cmd --reload
fi

log_step "4/10: Configuring fail2ban"
sudo tee /etc/fail2ban/jail.local > /dev/null << EOF
[sshd]
enabled = true
[nexusgenesis-p2p]
enabled = true
port = ${P2P_PORT}
filter = nexusgenesis-p2p
logpath = /var/log/nexusgenesis/p2p.log
maxretry = 5
bantime = 3600
EOF
sudo systemctl enable fail2ban
sudo systemctl restart fail2ban

log_step "5/10: Creating directory structure"
APP_DIR=/opt/nexusgenesis
sudo mkdir -p $APP_DIR
sudo mkdir -p /var/log/nexusgenesis
sudo mkdir -p $APP_DIR/data
sudo mkdir -p $APP_DIR/certs
sudo chown -R $USER:$USER $APP_DIR

log_step "6/10: Validating DNS"
if [ -n "${SERVER_DOMAIN:-}" ]; then
  if host "$SERVER_DOMAIN" > /dev/null 2>&1; then
    log_info "DNS resolved: $SERVER_DOMAIN"
  else
    log_warn "DNS not yet resolving: $SERVER_DOMAIN"
    log_warn "Please ensure DNS A record points to this server's IP"
  fi
fi

log_step "7/10: Obtaining TLS certificate"
if [ -n "${SERVER_DOMAIN:-}" ] && host "$SERVER_DOMAIN" > /dev/null 2>&1; then
  if command -v certbot &> /dev/null; then
    log_info "Certbot found, obtaining certificate..."
    sudo certbot certonly --standalone -d "$SERVER_DOMAIN" --email "admin@${DOMAIN_BASE}" --agree-tos --non-interactive
    if [ -f "/etc/letsencrypt/live/$SERVER_DOMAIN/fullchain.pem" ]; then
      sudo cp "/etc/letsencrypt/live/$SERVER_DOMAIN/fullchain.pem" $APP_DIR/certs/
      sudo cp "/etc/letsencrypt/live/$SERVER_DOMAIN/privkey.pem" $APP_DIR/certs/
      log_info "TLS certificates installed"
    fi
  else
    log_warn "Certbot not installed, using self-signed certs"
    cd $APP_DIR/certs
    openssl req -x509 -nodes -days 365 -newkey rsa:4096 \
      -keyout privkey.pem -out fullchain.pem \
      -subj "/CN=${SERVER_DOMAIN:-nexus-genesis.top}/O=NexusGenesis/C=IO"
  fi
else
  log_info "No DNS, generating self-signed certificates"
  cd $APP_DIR/certs
  openssl req -x509 -nodes -days 365 -newkey rsa:4096 \
    -keyout privkey.pem -out fullchain.pem \
    -subj "/CN=nexus-genesis.top/O=NexusGenesis/C=IO"
fi

log_step "8/10: Cloning NexusGenesis repository"
if [ ! -d "$APP_DIR/.git" ]; then
  git clone https://github.com/nexus-genesis/nexusgenesis.git "$APP_DIR"
else
  cd "$APP_DIR" && git pull origin master
fi

log_step "9/10: Building Docker image"
cd "$APP_DIR"
docker build -t nexusgenesis:mainnet .

log_step "10/10: Starting services"
if [ "$ROLE" = "seed" ]; then
  cat > $APP_DIR/docker-compose.override.yml << EOF
version: '3.8'
services:
  seed:
    image: nexusgenesis:mainnet
    container_name: nexusgenesis-seed-${SEED_INDEX}
    ports:
      - "${P2P_PORT}:${P2P_PORT}"
      - "${HTTP_PORT}:${HTTP_PORT}"
    environment:
      - NODE_ENV=production
      - SEED_INDEX=${SEED_INDEX}
      - SEED_DOMAIN=${SERVER_DOMAIN}
    volumes:
      - ./data:/app/data
      - ./certs:/app/certs:ro
    restart: unless-stopped
EOF
  docker compose -f docker-compose.prod.yml -f docker-compose.override.yml up -d seed
elif [ "$ROLE" = "validator" ]; then
  cat > $APP_DIR/docker-compose.override.yml << EOF
version: '3.8'
services:
  validator:
    image: nexusgenesis:mainnet
    container_name: nexusgenesis-validator-${VALIDATOR_NAME}
    ports:
      - "${P2P_PORT}:${P2P_PORT}"
      - "${HTTP_PORT}:${HTTP_PORT}"
    environment:
      - NODE_ENV=production
      - VALIDATOR_NAME=${VALIDATOR_NAME}
      - STAKE=${STAKE}
      - SEED_NODES=wss://seed1.nexus-genesis.top:9847,wss://seed2.nexus-genesis.top:9847,wss://seed3.nexus-genesis.top:9847,wss://seed4.nexus-genesis.top:9847
    volumes:
      - ./data:/app/data
      - ./certs:/app/certs:ro
    restart: unless-stopped
EOF
  docker compose -f docker-compose.prod.yml -f docker-compose.override.yml up -d validator
elif [ "$ROLE" = "fullnode" ]; then
  docker compose -f docker-compose.prod.yml up -d fullnode
fi

echo ""
echo "========================================"
echo " Provisioning Complete!"
echo "========================================"
echo ""
echo " Role:     $ROLE"
if [ -n "${SERVER_DOMAIN:-}" ]; then
  echo " Endpoint: wss://${SERVER_DOMAIN}:${P2P_PORT}"
fi
echo " HTTP API: http://localhost:${HTTP_PORT}"
echo ""
echo " Check status:"
echo "   docker compose -f $APP_DIR/docker-compose.prod.yml logs -f"
echo "   curl http://localhost:${HTTP_PORT}/health"
echo ""

# Cron job for certificate renewal
if command -v certbot &> /dev/null; then
  (crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet --post-hook 'cp /etc/letsencrypt/live/${SERVER_DOMAIN}/fullchain.pem $APP_DIR/certs/ && cp /etc/letsencrypt/live/${SERVER_DOMAIN}/privkey.pem $APP_DIR/certs/'") | crontab -
fi
