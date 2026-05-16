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
DOMAIN_BASE=${DOMAIN_BASE:-"nexusgenesis.io"}

echo "========================================"
echo " NexusGenesis Mainnet Server Provisioner"
echo "========================================"
echo ""
echo " Role:     $ROLE"
echo " Hostname: $SERVER_HOSTNAME"

if [ "$ROLE" = "seed" ]; then
  echo " Seed #:   $SEED_INDEX"
  SERVER_DOMAIN="seed${SEED_INDEX}.${DOMAIN_BASE}"
elif [ "$ROLE" = "validator" ]; then
  echo " Name:     $VALIDATOR_NAME"
  echo " Stake:    $STAKE NGEN"
  SERVER_DOMAIN="${VALIDATOR_NAME}.${DOMAIN_BASE}"
fi

echo " Domain:   $SERVER_DOMAIN"
echo ""

# ---- Step 1: System Updates & Docker ----
log_step "1/10: Installing system dependencies"

if command -v apt-get &> /dev/null; then
  log_info "Detected Debian/Ubuntu"
  sudo apt-get update -qq
  sudo apt-get install -y -qq \
    curl wget git build-essential \
    openssl ufw fail2ban \
    htop iotop net-tools \
    certbot python3-certbot > /dev/null 2>&1
elif command -v yum &> /dev/null; then
  log_info "Detected RHEL/CentOS"
  sudo yum install -y -q \
    curl wget git gcc-c++ make \
    openssl firewalld fail2ban \
    htop iotop net-tools \
    certbot python3-certbot > /dev/null 2>&1
fi

# ---- Step 2: Docker Installation ----
log_step "2/10: Installing Docker"

if ! command -v docker &> /dev/null; then
  curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
  sudo sh /tmp/get-docker.sh > /dev/null 2>&1
  sudo usermod -aG docker "$USER"
  rm /tmp/get-docker.sh
fi

if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
  sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" \
    -o /usr/local/bin/docker-compose
  sudo chmod +x /usr/local/bin/docker-compose
fi

log_info "Docker $(docker --version) installed"

# ---- Step 3: Firewall Configuration ----
log_step "3/10: Configuring firewall"

P2P_PORT=9847
HTTP_PORT=19890

if [ "$ROLE" = "validator" ]; then
  case "${SEED_INDEX:-}" in
    1) P2P_PORT=9848; HTTP_PORT=19891 ;;
    2) P2P_PORT=9849; HTTP_PORT=19892 ;;
    *) P2P_PORT=$((9848 + RANDOM % 100)); HTTP_PORT=$((19891 + RANDOM % 100)) ;;
  esac
fi

if command -v ufw &> /dev/null; then
  sudo ufw allow 22/tcp
  sudo ufw allow 80/tcp
  sudo ufw allow 443/tcp
  sudo ufw allow ${P2P_PORT}/tcp
  sudo ufw allow ${HTTP_PORT}/tcp
  sudo ufw --force enable
  log_info "UFW configured: SSH(22), HTTP(80,443), P2P(${P2P_PORT}), HTTP(${HTTP_PORT})"
elif command -v firewall-cmd &> /dev/null; then
  sudo firewall-cmd --permanent --add-service=ssh
  sudo firewall-cmd --permanent --add-service=http
  sudo firewall-cmd --permanent --add-service=https
  sudo firewall-cmd --permanent --add-port=${P2P_PORT}/tcp
  sudo firewall-cmd --permanent --add-port=${HTTP_PORT}/tcp
  sudo firewall-cmd --reload
fi

# ---- Step 4: fail2ban ----
log_step "4/10: Setting up fail2ban"

sudo tee /etc/fail2ban/jail.local > /dev/null << EOF
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5

[sshd]
enabled = true

[nexusgenesis-p2p]
enabled = true
port = ${P2P_PORT}
filter = nexusgenesis
logpath = /var/log/nexusgenesis/p2p.log
maxretry = 10
EOF

sudo systemctl enable fail2ban
sudo systemctl restart fail2ban

# ---- Step 5: Application Directory ----
log_step "5/10: Setting up application directory"

APP_DIR=${APP_DIR:-/opt/nexusgenesis}
sudo mkdir -p "$APP_DIR"
sudo mkdir -p "$APP_DIR/data" "$APP_DIR/logs" "$APP_DIR/certs"
sudo mkdir -p /var/log/nexusgenesis

# ---- Step 6: DNS Verification ----
log_step "6/10: Verifying DNS resolution"

if host "$SERVER_DOMAIN" > /dev/null 2>&1; then
  log_info "DNS verified: $SERVER_DOMAIN resolves to $(host $SERVER_DOMAIN | awk '{print $NF}')"
else
  log_warn "DNS not yet configured for $SERVER_DOMAIN"
  log_warn "Please add an A record pointing to this server's IP before proceeding"
fi

# ---- Step 7: SSL/TLS Certificate ----
log_step "7/10: Obtaining SSL/TLS certificate"

if [ -f "$APP_DIR/certs/fullchain.pem" ]; then
  log_info "Existing certificate found, checking validity..."
  if openssl x509 -checkend 2592000 -noout -in "$APP_DIR/certs/fullchain.pem"; then
    log_info "Certificate valid for 30+ days"
  else
    log_warn "Certificate expiring soon, renewing..."
  fi
elif [ -n "${SERVER_DOMAIN:-}" ] && host "$SERVER_DOMAIN" > /dev/null 2>&1; then
  log_info "Requesting Let's Encrypt certificate for $SERVER_DOMAIN..."
  sudo certbot certonly --standalone \
    -d "$SERVER_DOMAIN" \
    --email "admin@${DOMAIN_BASE}" \
    --agree-tos --non-interactive 2>&1 || log_warn "Certbot failed, using self-signed fallback"

  if [ -d "/etc/letsencrypt/live/$SERVER_DOMAIN" ]; then
    sudo cp "/etc/letsencrypt/live/$SERVER_DOMAIN/fullchain.pem" "$APP_DIR/certs/fullchain.pem"
    sudo cp "/etc/letsencrypt/live/$SERVER_DOMAIN/privkey.pem"   "$APP_DIR/certs/privkey.pem"
    sudo cp "/etc/letsencrypt/live/$SERVER_DOMAIN/chain.pem"     "$APP_DIR/certs/ca.pem"
    sudo chown "$(whoami):$(whoami)" "$APP_DIR/certs/"*.pem
    log_info "Let's Encrypt certificate installed"
  fi
else
  log_warn "Cannot obtain certificate - DNS not configured. Using self-signed fallback."
  log_warn "Run: openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout $APP_DIR/certs/privkey.pem -out $APP_DIR/certs/fullchain.pem"
fi

# ---- Step 8: Clone/Pull Repository ----
log_step "8/10: Deploying NexusGenesis"

if [ -d "$APP_DIR/.git" ]; then
  cd "$APP_DIR"
  git fetch origin master
  git reset --hard origin/master
  log_info "Repository updated"
else
  sudo git clone https://github.com/nexus-genesis/nexusgenesis.git "$APP_DIR"
  log_info "Repository cloned"
fi

# ---- Step 9: Build Docker Image ----
log_step "9/10: Building Docker image"

cd "$APP_DIR"
echo "NODE_ENV=mainnet" > "$APP_DIR/.env"
echo "CHAIN_ID=nexus-mainnet" >> "$APP_DIR/.env"
echo "NODE_ROLE=$ROLE" >> "$APP_DIR/.env"
echo "NODE_PORT=$P2P_PORT" >> "$APP_DIR/.env"
echo "HTTP_PORT=$HTTP_PORT" >> "$APP_DIR/.env"

if [ "$ROLE" = "validator" ]; then
  echo "VALIDATOR_STAKE=$STAKE" >> "$APP_DIR/.env"
  echo "VALIDATOR_NAME=$VALIDATOR_NAME" >> "$APP_DIR/.env"
  echo "SEED_NODES=wss://seed1.${DOMAIN_BASE}:9847,wss://seed2.${DOMAIN_BASE}:9847,wss://seed3.${DOMAIN_BASE}:9847,wss://seed4.${DOMAIN_BASE}:9847" >> "$APP_DIR/.env"
fi

docker build -t nexusgenesis:mainnet . 2>&1 | tail -5

# ---- Step 10: Start Services ----
log_step "10/10: Starting services"

if [ "$ROLE" = "seed" ]; then
  docker compose -f docker-compose.prod.yml up -d genesis 2>&1
elif [ "$ROLE" = "validator" ]; then
  docker compose -f docker-compose.prod.yml up -d "${VALIDATOR_NAME}" 2>&1 || \
    log_warn "Validator service not in main compose, using separate deployment"
fi

# ---- Verification ----
log_step "Verification"

sleep 5

echo ""
echo "========================================"
echo " Deployment Complete"
echo "========================================"
echo ""
echo "  Role:       $ROLE"
echo "  Domain:     $SERVER_DOMAIN"
echo "  P2P Port:   $P2P_PORT"
echo "  HTTP Port:  $HTTP_PORT"
echo ""
echo "  Health Check:"
echo "    curl http://localhost:$HTTP_PORT/health"
echo "    curl http://localhost:$HTTP_PORT/metrics"
echo ""
echo "  Logs:"
echo "    docker compose -f $APP_DIR/docker-compose.prod.yml logs -f"
echo ""
echo "========================================"