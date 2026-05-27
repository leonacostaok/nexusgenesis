# NexusGenesis Second Node Deployment Guide

## Overview

This guide helps you deploy a NexusGenesis validator node and join the existing P2P network. By running a node, you:

- Help decentralize the network
- Earn NGEN testnet rewards
- Gain on-chain reputation as an early validator
- Get priority access to future governance proposals

**Current network target: 1 → 7 → 21 validators.**

---

## Prerequisites

| Requirement | Minimum | Recommended |
|-------------|---------|-------------|
| CPU | 2 cores | 4 cores |
| RAM | 2 GB | 4 GB |
| Disk | 10 GB SSD | 30 GB SSD |
| Network | 10 Mbps, static IP | 100 Mbps, static IP |
| OS | Ubuntu 20.04+ / Debian 11+ | Ubuntu 22.04 LTS |
| Ports | 9848 (or custom P2P port) | Open inbound TCP on your P2P port |

---

## Method 1: Docker Deployment (Recommended)

### Step 1: Install Docker

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# Log out and back in, or run: newgrp docker
```

### Step 2: Clone and configure

```bash
git clone https://github.com/nexus-genesis/nexusgenesis.git
cd nexusgenesis
cp .env.example .env
```

Edit `.env`:

```ini
NODE_NAME=nexus-node-02
P2P_PORT=9848
SEED_NODES=ws://98.142.241.236:9847
NODE_ENV=testnet
```

### Step 3: Generate wallet

```bash
docker compose -f docker-compose.multi-node.yml run --rm node-genesis node scripts/generate-wallet.js
```

Save the wallet address (e.g., `ng1aBcDeF...`) and password securely.

### Step 4: Start your node

```bash
docker compose -f docker-compose.multi-node.yml up -d node-genesis
```

### Step 5: Verify

```bash
# Check logs
docker logs nexusgenesis-genesis --tail 20

# Expected output:
# [✓] P2P Server: Active on port 9848
# [✓] Connected to peer on port 9847
# NODE 1 STATUS ... Peers: 1
```

Your node should show `Peers: 1` (connected to the genesis node).

---

## Method 2: Native Node.js Deployment (Linux)

### Step 1: Install dependencies

```bash
# Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs git

# Verify
node --version  # ≥ v18.0.0
npm --version
```

### Step 2: Clone and install

```bash
git clone https://github.com/nexus-genesis/nexusgenesis.git
cd nexusgenesis
npm install
cp .env.example .env
```

### Step 3: Configure

Edit `.env`:

```ini
NODE_NAME=nexus-node-02
P2P_PORT=9848
SEED_NODES=ws://98.142.241.236:9847
NODE_ENV=testnet
```

### Step 4: Start

```bash
node src/node/node1.js
```

Expected output:

```
═══════════════════════════════════════════════════
  NEXUSGENESIS - NODE 1
  Version: 1.0.0
  Epoch: Epoch 2: Bloom
  Port: 9848
═══════════════════════════════════════════════════

[1/5] Loading wallet...
[2/5] Starting P2P communication layer...
  [✓] P2P Server: Active on port 9848
[3/5] Protocol-Zero handshake ready
[4/5] Connecting to peers...
  [✓] Connected to port 9847
[5/5] Node ONLINE
```

### Step 5: Daemonize with systemd

Create `/etc/systemd/system/nexusgenesis-node.service`:

```ini
[Unit]
Description=NexusGenesis Validator Node
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/opt/nexusgenesis
ExecStart=/usr/bin/node /opt/nexusgenesis/src/node/node1.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable nexusgenesis-node
sudo systemctl start nexusgenesis-node
sudo journalctl -u nexusgenesis-node -f
```

---

## Method 3: Cloud One-Click Deployment

### Hetzner CX22 (€4/month)

```bash
# After SSH into fresh instance
curl -sSL https://github.com/nexus-genesis/nexusgenesis/raw/master/scripts/deploy-hetzner.sh | bash
```

### DigitalOcean Droplet ($6/month)

1. Create a Ubuntu 22.04 Droplet
2. SSH in and run:
```bash
curl -sSL https://github.com/nexus-genesis/nexusgenesis/raw/master/scripts/deploy-do.sh | bash
```

### AWS EC2 t3.small

Use the CloudFormation template:

```bash
aws cloudformation create-stack \
  --template-url https://nexus-genesis-deploy.s3.amazonaws.com/cloudformation.yaml \
  --stack-name nexusgenesis-validator \
  --parameters ParameterKey=KeyName,ParameterValue=your-key
```

---

## Verify Your Node Is Working

### Check peer connections

```bash
curl -s http://localhost:19891/status | jq '.peers'
```

Expected:

```json
{
  "count": 1,
  "verified": 1
}
```

### Check on dashboard

Visit https://nexus-genesis.top and verify your node address appears in the validator list.

### Check health

```bash
curl -s http://localhost:19891/health | jq
```

---

## Validator Incentives

| Metric | Reward | How to earn |
|--------|--------|-------------|
| **Uptime** | +10 NGEN/day | Keep node online 24/7 |
| **Peer count** | +5 NGEN/peer/day | Maintain P2P connections |
| **Block production** | +10 NGEN/block | Produce blocks when elected leader |
| **Agent registrations** | +50 NGEN/agent | Process agent join transactions |
| **Early validator bonus** | x2 multiplier | First 21 validators get doubled rewards |

**Reward schedule**: Swarm Pool distributes every 7 days to your registered wallet.

---

## Troubleshooting

### "Connection to port 9847 failed"

1. Check the genesis node is online: `curl https://nexus-genesis.top/health`
2. Verify your firewall allows outbound TCP to port 9847
3. Ensure you're using the correct seed address: `ws://98.142.241.236:9847`

### "Wallet not found"

Run `node scripts/generate-wallet.js` to create a new wallet. The wallet file must exist at `data/wallets/<your-address>.json`.

### "Port already in use"

```bash
# Find the process
sudo lsof -i :9848
# Kill it or change P2P_PORT in .env
```

### "No peers after 5 minutes"

1. Restart the node
2. Check network connectivity: `ping nexus-genesis.top`
3. Verify SEED_NODES in .env matches the genesis node address

---

## FAQ

**Q: Can I run multiple nodes on one machine?**
A: Yes, with separate ports and data directories. Use `docker-compose.multi-node.yml` for the full 3-node local testnet.

**Q: What's the minimum stake to be a validator?**
A: During testnet (Epoch 2), no minimum stake is required. The BFT committee selects nodes based on health score, not stake weight.

**Q: How do I upgrade my node?**
A: `git pull && npm install` then restart. Major upgrades will be announced on GitHub Discussions.

**Q: Is my NGEN reward real?**
A: NGEN is a testnet token with no economic value. It represents on-chain reputation and will be used for governance voting.

**Q: I found a bug. Where do I report it?**
A: Open a GitHub Issue with `[validator]` prefix and attach relevant logs.

---

## Next Steps

- [ ] Join [GitHub Discussions](https://github.com/nexus-genesis/nexusgenesis/discussions) and introduce your node
- [ ] Register an Agent on your node via the REST API
- [ ] Monitor your node on the dashboard: https://nexus-genesis.top
- [ ] Propose protocol improvements via governance
- [ ] Recruit more validators — the faster we reach 21, the faster Epoch 3 begins

---

**Questions?** Open a Discussion or contact maintainers on GitHub.