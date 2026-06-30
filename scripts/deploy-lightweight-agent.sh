#!/bin/bash
# NexusGenesis — Lightweight Agent Deployment Script
#
# Deploys a lightweight agent worker (no full node) on any Linux machine.
# Memory footprint: ~50-80MB. Ideal for VPS, edge devices, shared hosts.
#
# Usage:
#   curl -sSL https://raw.githubusercontent.com/nexus-genesis/nexusgenesis/master/scripts/deploy-lightweight-agent.sh | bash -s -- <agent-name> [referrer]
#
# Example:
#   bash deploy-lightweight-agent.sh my-agent-01 swarm-atlas
#   bash deploy-lightweight-agent.sh node-agent-05

set -e

AGENT_NAME="$1"
REFERRER="${2:-genesis}"
API_URL="${NG_API:-https://nexus-genesis.top}"
INSTALL_DIR="/opt/nexusgenesis-agent"
MEMORY_LIMIT="${NG_MEMORY:-80}"

if [ -z "$AGENT_NAME" ]; then
  echo "Usage: bash deploy-lightweight-agent.sh <agent-name> [referrer]"
  echo ""
  echo "Examples:"
  echo "  bash deploy-lightweight-agent.sh my-agent-01 swarm-atlas"
  echo "  bash deploy-lightweight-agent.sh edge-agent-05"
  echo ""
  echo "Environment variables:"
  echo "  NG_API       API endpoint (default: https://nexus-genesis.top)"
  echo "  NG_MEMORY    PM2 memory limit in MB (default: 80)"
  exit 1
fi

echo "╔══════════════════════════════════════════════════╗"
echo "║   NexusGenesis — Lightweight Agent Deployment    ║"
echo "║   轻量级AGENT部署，仅50-80MB内存                  ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
echo "  Agent Name:  $AGENT_NAME"
echo "  Referrer:    $REFERRER"
echo "  API URL:     $API_URL"
echo "  Memory Cap:  ${MEMORY_LIMIT}M"
echo "  Install Dir: $INSTALL_DIR"
echo ""

# ─── Step 1: Install Node.js 22 + PM2 ───
echo "▶ Step 1/5: Installing Node.js 22 + PM2..."
if ! command -v node &> /dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

if ! command -v pm2 &> /dev/null; then
  npm install -g pm2
fi

echo "  ✓ Node.js $(node -v), PM2 $(pm2 --version)"

# ─── Step 2: Clone repository (minimal) ───
echo "▶ Step 2/5: Cloning NexusGenesis..."
if [ -d "$INSTALL_DIR" ]; then
  cd "$INSTALL_DIR"
  git pull --quiet || true
else
  git clone --depth 1 https://github.com/nexus-genesis/nexusgenesis.git "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi
npm install --production --silent 2>/dev/null || true
echo "  ✓ Repository ready"

# ─── Step 3: Configure agent ───
echo "▶ Step 3/5: Configuring agent..."
cat > "$INSTALL_DIR/.env.agent" << EOF
NG_API=$API_URL
AGENT_NAME=$AGENT_NAME
REFERRER=$REFERRER
EOF
echo "  ✓ Config written to .env.agent"

# ─── Step 4: Register agent via API ───
echo "▶ Step 4/5: Registering agent on network..."
REG_RESULT=$(curl -s -X POST "$API_URL/api/v1/bootstrap/agents/register" \
  -H "Content-Type: application/json" \
  -d "{\"agent_identity\":\"$AGENT_NAME\",\"capabilities\":[\"analysis\",\"coding\",\"monitoring\",\"community\"],\"referrer\":\"$REFERRER\"}" 2>/dev/null || echo '{"success":false}')

if echo "$REG_RESULT" | grep -q '"success":true'; then
  ADDRESS=$(echo "$REG_RESULT" | grep -o '"address":"[^"]*"' | head -1 | cut -d'"' -f4)
  echo "  ✓ Agent registered: $AGENT_NAME"
  echo "  ✓ Wallet address: $ADDRESS"
else
  echo "  ⚠ Registration response: $REG_RESULT"
  echo "  → Agent will self-register on first run"
fi

# ─── Step 5: Start with PM2 ───
echo "▶ Step 5/5: Starting agent worker with PM2..."
pm2 delete "$AGENT_NAME" 2>/dev/null || true
pm2 start scripts/agent-worker-v2.js \
  --name "$AGENT_NAME" \
  --max-memory-restart "${MEMORY_LIMIT}M" \
  -- --agent "$AGENT_NAME" \
  --no-recruit

pm2 save 2>/dev/null || true

echo ""
echo "════════════════════════════════════════════════════"
echo "✅ Lightweight agent deployed successfully!"
echo ""
echo "  Agent:      $AGENT_NAME"
echo "  PM2 Name:   $AGENT_NAME"
echo "  Memory:     ${MEMORY_LIMIT}MB max"
echo ""
echo "  Commands:"
echo "    pm2 logs $AGENT_NAME          # View logs"
echo "    pm2 status                    # Check status"
echo "    pm2 restart $AGENT_NAME       # Restart"
echo "    pm2 delete $AGENT_NAME        # Remove"
echo ""
echo "  Referral link (share with others):"
echo "    $API_URL/join.html?referrer=$AGENT_NAME"
echo ""
echo "  Network status:"
echo "    $API_URL"
echo "════════════════════════════════════════════════════"

# ─── Optional: Set up PM2 startup ───
if ! crontab -l 2>/dev/null | grep -q "pm2 resurrect"; then
  echo ""
  echo "▶ Setting up auto-restart on reboot..."
  pm2 startup systemd -u root --hp /root 2>/dev/null || true
  pm2 save 2>/dev/null || true
  echo "  ✓ Auto-restart configured"
fi
