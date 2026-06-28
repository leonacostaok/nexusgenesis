# NexusGenesis External Validator Runbook

## Purpose

This runbook is the source of truth for **external validator onboarding during the current bootstrap coordination phase**.

It is intentionally narrower than DevNet guides and internal multi-node demos:

- Use this document if you want to run an independently hosted validator candidate.
- Do not use `src/node/node1.js` as your public onboarding path.
- Do not treat `docker-compose.multi-node.yml` as the production template for third-party validators.
- Do not use `docs/DEVNET_GUIDE.md` for external validator onboarding.

Current phase facts:

- The public network is live and externally reachable.
- Agent registration, agent visibility, validator join, and bootstrap status APIs are working.
- The network is still in a **bootstrap coordination phase**, not yet a fully permissionless 21-validator swarm.
- External operators should validate the real path: **connect -> observe -> register agent -> verify visibility -> join validator committee**.

---

## Current Scope

This runbook covers:

1. Preparing a Linux host
2. Running a node with the current supported entrypoint
3. Connecting to the bootstrap seed
4. Verifying local HTTP and P2P behavior
5. Registering an agent identity
6. Joining the validator committee through the public bootstrap API
7. Basic troubleshooting and rollback

This runbook does **not** claim that:

- external validator block production is already fully decentralized
- the legacy internal node scripts are the canonical public entrypoint
- DevNet demo flows are equivalent to public validator onboarding

---

## Minimum Requirements

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| CPU | 2 vCPU | 4 vCPU |
| RAM | 4 GB | 8 GB |
| Disk | 20 GB SSD | 80 GB NVMe |
| Network | Stable public IPv4 | Public IPv4 + monitoring |
| OS | Ubuntu 22.04 LTS | Ubuntu 22.04/24.04 LTS |
| Open ports | TCP `9848` | TCP `9848` + restricted SSH |

Notes:

- The public bootstrap seed currently listens on P2P `9847`.
- Your local HTTP API can stay bound to localhost unless you explicitly need remote access.
- If multiple nodes run on one machine, each one needs its own `DATA_DIR`, `P2P_PORT`, and `HTTP_PORT`.

---

## Required Facts Before You Start

- Repository root entrypoint: `src/index.js`
- Supported runtime command: `npm run start`
- Default public bootstrap API health:
  - `https://nexus-genesis.top/health`
  - `https://nexus-genesis.top/api/v1/bootstrap/status`
  - `https://nexus-genesis.top/api/v1/agents`
- Current bootstrap seed example:
  - `ws://98.142.241.236:9847`

The supported external-node path is to run the unified main entry with explicit environment variables, for example:

```bash
NODE_ROLE=peer \
P2P_PORT=9848 \
HTTP_PORT=19892 \
DATA_DIR=data/validator-01 \
SEED_NODES=ws://98.142.241.236:9847 \
npm run start
```

---

## Host Preparation

### 1. Install system packages

```bash
sudo apt-get update
sudo apt-get install -y curl git build-essential ufw
```

### 2. Install Node.js 18+

```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

node --version
npm --version
```

### 3. Clone the repository

```bash
git clone https://github.com/nexus-genesis/nexusgenesis.git
cd nexusgenesis
npm install
```

---

## Environment Configuration

Create a dedicated runtime file for your external node:

```bash
cp .env.example .env.validator
```

Edit `.env.validator`:

```ini
NODE_ENV=testnet
NODE_ROLE=peer
NODE_NAME=external-validator-01

P2P_PORT=9848
HTTP_PORT=19892
DATA_DIR=data/validator-01

SEED_NODES=ws://98.142.241.236:9847

ALLOW_SINGLE_NODE_BLOCKS=false
LOG_LEVEL=info
```

Recommended operator rules:

- Keep `HTTP_PORT` local-only unless you need remote API access.
- Use a dedicated `DATA_DIR` per node.
- Keep `SEED_NODES` explicit and auditable.
- Do not copy internal demo values such as fixed `node1.js` addresses or local-only seed lists.

---

## Firewall

Open your P2P port and keep SSH restricted:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 9848/tcp
sudo ufw enable
sudo ufw status
```

If you expose HTTP externally, explicitly open your chosen `HTTP_PORT` and put it behind your own access policy.

---

## First Boot

Start the node from the repository root:

```bash
set -a
source ./.env.validator
set +a
npm run start
```

Expected early startup behavior:

- The process prints the selected role, P2P port, HTTP port, and data directory.
- A wallet is generated automatically under your chosen `DATA_DIR` on first boot.
- The local HTTP server binds successfully.
- The node attempts to connect to the configured seed node.

Expected log themes:

```text
Role: peer | P2P: 9848 | HTTP: 19892 | Data: data/validator-01
[✓] P2P Server: Active on port 9848
[✓] HTTP Server: Active on http://0.0.0.0:19892
```

---

## Daemonize With systemd

Create `/etc/systemd/system/nexusgenesis-validator.service`:

```ini
[Unit]
Description=NexusGenesis External Validator
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/opt/nexusgenesis
EnvironmentFile=/opt/nexusgenesis/.env.validator
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

Then enable it:

```bash
sudo systemctl daemon-reload
sudo systemctl enable nexusgenesis-validator
sudo systemctl start nexusgenesis-validator
sudo journalctl -u nexusgenesis-validator -f
```

---

## Local Verification

### 1. Verify local health

```bash
curl -s http://127.0.0.1:19892/health | jq
curl -s http://127.0.0.1:19892/api/v1/bootstrap/status | jq
```

Expected result:

- `/health` returns `success: true`
- `/api/v1/bootstrap/status` returns `success: true`

### 2. Verify agent visibility endpoint

```bash
curl -s http://127.0.0.1:19892/api/v1/agents | jq
```

### 3. Verify public bootstrap endpoints

```bash
curl -s https://nexus-genesis.top/health | jq
curl -s https://nexus-genesis.top/api/v1/bootstrap/status | jq
curl -s https://nexus-genesis.top/api/v1/agents | jq
```

This confirms the public bootstrap coordinator is reachable before you try onboarding actions.

---

## Agent Registration

Register your validator identity through the public bootstrap API:

```bash
curl -sX POST https://nexus-genesis.top/api/v1/bootstrap/agents/register \
  -H "Content-Type: application/json" \
  -d '{
    "agent_identity": "external-validator-01",
    "capabilities": ["validation", "p2p", "monitoring"]
  }' | jq
```

Expected result:

- Response returns `success: true`
- Your agent later appears in `GET /api/v1/agents`

Verify:

```bash
curl -s https://nexus-genesis.top/api/v1/agents | jq
```

---

## Validator Committee Join

Once your agent is visible, request validator join:

```bash
curl -sX POST https://nexus-genesis.top/api/v1/bootstrap/validators/join \
  -H "Content-Type: application/json" \
  -d '{
    "agent_identity": "external-validator-01",
    "stake": 5000
  }' | jq
```

Expected result:

- Response returns `success: true`
- The agent is marked as validator-capable in the public listing
- Bootstrap status reflects committee progress

Verify again:

```bash
curl -s https://nexus-genesis.top/api/v1/agents | jq
curl -s https://nexus-genesis.top/api/v1/bootstrap/status | jq
```

---

## Minimal Acceptance Checklist

An external validator candidate is considered successfully onboarded when all of the following are true:

1. The node process stays up under `systemd` or equivalent supervision.
2. The local node exposes `GET /health`.
3. The local node exposes `GET /api/v1/bootstrap/status`.
4. The node has a non-empty persistent `DATA_DIR`.
5. The operator can prove seed connectivity from logs.
6. The operator registers an `agent_identity` through the public bootstrap API.
7. The agent becomes visible in `GET /api/v1/agents`.
8. The validator join request succeeds through `POST /api/v1/bootstrap/validators/join`.

---

## Troubleshooting

### Local HTTP does not bind

Check:

```bash
ss -ltnp | grep 19892
journalctl -u nexusgenesis-validator -n 100 --no-pager
```

Common causes:

- another process is already using the port
- `HTTP_PORT` was not exported into the runtime environment
- the process was started from the wrong working directory

### No P2P connectivity

Check:

```bash
ss -ltnp | grep 9848
nc -vz 98.142.241.236 9847
```

Common causes:

- local firewall blocks outbound or inbound TCP
- `SEED_NODES` is empty or malformed
- operator used an internal-only script instead of the unified main entry

### Public registration works but local node is unhealthy

This usually means your public API usage is fine but your own node runtime is not yet stable. Fix your local process first, then re-run local health checks.

### `validators/join` returns 404

Your `agent_identity` has not yet been registered on-chain or is not visible yet. Re-check:

```bash
curl -s https://nexus-genesis.top/api/v1/agents | jq
```

### `validators/join` returns 409

The agent is already in the validator committee. Re-check the public listing and bootstrap status.

---

## Rollback

To stop the node safely:

```bash
sudo systemctl stop nexusgenesis-validator
```

To restart after config changes:

```bash
sudo systemctl restart nexusgenesis-validator
sudo journalctl -u nexusgenesis-validator -f
```

To reset only your external validator candidate data directory:

```bash
rm -rf data/validator-01
```

Do this only for your own node data. Do not use this against shared bootstrap infrastructure.

---

## Relationship To Other Documents

- `SECOND_NODE_GUIDE.md`: short operator quickstart
- `docs/DEVNET_GUIDE.md`: local development and demo network only
- `STATUS.md`: current network truth and phase definition
- `TESTNET.md`: public API usage and current bootstrap-stage interaction

If any onboarding advice conflicts with DevNet demos or internal compose examples, this runbook wins for the current external validator path.
