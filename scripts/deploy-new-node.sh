#!/bin/bash
# NexusGenesis Node Deployment Script
# Deploys a full blockchain node on a fresh Linux server.
#
# Usage:
#   ./scripts/deploy-new-node.sh <node-name> <data-dir> [seed-nodes]
#
# Example:
#   ./scripts/deploy-new-node.sh node04 /data/node04 "nexus-genesis.top:19890"
#
# Prerequisites: fresh Ubuntu/Debian server with root access.

set -euo pipefail

NODE_NAME="${1:-node04}"
DATA_DIR="${2:-/data/${NODE_NAME}}"
SEED_NODES="${3:-nexus-genesis.top:19890}"
REPO_URL="https://github.com/nexus-genesis/nexusgenesis.git"
INSTALL_DIR="/opt/nexusgenesis"
PM2_NAME="nexusgenesis-${NODE_NAME}"

echo "══════════════════════════════════════════════════"
echo "  NexusGenesis Node Deployment"
echo "  Node: ${NODE_NAME}"
echo "  Data: ${DATA_DIR}"
echo "  Seeds: ${SEED_NODES}"
echo "══════════════════════════════════════════════════"

# ─── 1. Install Node.js ───
if ! command -v node &>/dev/null; then
  echo "[1/7] Installing Node.js 22..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
else
  echo "[1/7] Node.js already installed: $(node --version)"
fi

# ─── 2. Install PM2 ───
if ! command -v pm2 &>/dev/null; then
  echo "[2/7] Installing PM2..."
  npm install -g pm2
else
  echo "[2/7] PM2 already installed: $(pm2 --version)"
fi

# ─── 3. Clone repository ───
if [ -d "${INSTALL_DIR}/.git" ]; then
  echo "[3/7] Repository exists, pulling latest..."
  cd "${INSTALL_DIR}" && git pull origin master
else
  echo "[3/7] Cloning repository..."
  git clone "${REPO_URL}" "${INSTALL_DIR}"
fi
cd "${INSTALL_DIR}"

# ─── 4. Install dependencies ───
echo "[4/7] Installing npm dependencies..."
npm install --production

# ─── 5. Create data directory ───
echo "[5/7] Setting up data directory: ${DATA_DIR}"
mkdir -p "${DATA_DIR}/blockchain"
mkdir -p "${DATA_DIR}/state"

# ─── 6. Sync chain data from genesis node ───
echo "[6/7] Syncing chain data from genesis node..."
GENESIS_HOST="nexus-genesis.top"
GENESIS_SSH_USER="root"

if ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no "${GENESIS_SSH_USER}@${GENESIS_HOST}" "test -f /opt/nexusgenesis/data/genesis/blockchain/blocks.json" 2>/dev/null; then
  echo "  Fetching blocks.json from genesis node..."
  scp -o ConnectTimeout=10 -o StrictHostKeyChecking=no \
    "${GENESIS_SSH_USER}@${GENESIS_HOST}:/opt/nexusgenesis/data/genesis/blockchain/blocks.json" \
    "${DATA_DIR}/blockchain/blocks.json"
  echo "  ✓ Chain data synced"
else
  echo "  ⚠ Could not reach genesis node via SSH. Node will start with empty chain."
  echo "  Manual sync required: copy blocks.json from an existing node."
fi

# ─── 7. Configure and start with PM2 ───
echo "[7/7] Starting node with PM2..."

# Create logs directory
mkdir -p /var/log/nexusgenesis

# Environment configuration
export DATA_DIR="${DATA_DIR}"
export SEED_NODES="${SEED_NODES}"
export P2P_PORT=19890
export HTTP_PORT=19892
export NODE_ENV=production

# Generate node identity
NODE_ID_FILE="${DATA_DIR}/.node-id"
if [ ! -f "${NODE_ID_FILE}" ]; then
  echo "  Generating new node identity..."
  node -e "const{PQCWallet}=await import('./src/wallet/pqcWallet.js');const w=await PQCWallet.create();console.log(JSON.stringify({address:w.address,publicKey:w.publicKey.toString('hex'),privateKey:w.privateKey.toString('hex')}))" > "${NODE_ID_FILE}" 2>/dev/null || true
fi

pm2 start src/index.js \
  --name "${PM2_NAME}" \
  --cwd "${INSTALL_DIR}" \
  --max-memory-restart 200M \
  --log /var/log/nexusgenesis/${NODE_NAME}-out.log \
  --error /var/log/nexusgenesis/${NODE_NAME}-error.log \
  --time \
  --env DATA_DIR="${DATA_DIR}" \
  --env SEED_NODES="${SEED_NODES}" \
  --env P2P_PORT="${P2P_PORT}" \
  --env HTTP_PORT="${HTTP_PORT}" \
  --env NODE_ENV=production

pm2 save

echo ""
echo "══════════════════════════════════════════════════"
echo "  ✓ Node ${NODE_NAME} deployed and started!"
echo ""
echo "  PM2 name: ${PM2_NAME}"
echo "  Data dir: ${DATA_DIR}"
echo "  P2P port: ${P2P_PORT}"
echo "  HTTP port: ${HTTP_PORT}"
echo "  Seed nodes: ${SEED_NODES}"
echo ""
echo "  Logs: pm2 logs ${PM2_NAME}"
echo "  Status: pm2 status ${PM2_NAME}"
echo "  Stop: pm2 stop ${PM2_NAME}"
echo "══════════════════════════════════════════════════"
