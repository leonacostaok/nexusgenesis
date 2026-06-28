#!/bin/bash
# Optimize server resources: stop node03, restart with tighter limits,
# and start 3 new agent workers in the freed memory.
#
# Run on server: bash scripts/optimize-and-expand.sh

set -e
cd /opt/nexusgenesis

echo "══════════════════════════════════════════════════"
echo "  Server Optimization + Agent Expansion"
echo "══════════════════════════════════════════════════"

# ─── 1. Pull latest code ───
echo "[1/6] Pulling latest code..."
git pull origin master

# ─── 2. Stop node03 to free ~130MB ───
echo "[2/6] Stopping node03 to free memory..."
pm2 stop nexusgenesis-node03 2>/dev/null || true
echo "  ✓ node03 stopped"

# ─── 3. Reduce genesis + node02 memory limits ───
echo "[3/6] Tightening node memory limits..."
pm2 restart nexusgenesis-genesis --max-memory-restart 200M 2>/dev/null || true
pm2 restart nexusgenesis-node02 --max-memory-restart 150M 2>/dev/null || true
echo "  ✓ genesis=200M, node02=150M"

# ─── 4. Start 3 new agent workers (80M each) ───
echo "[4/6] Starting 3 new agent workers..."
pm2 start scripts/agent-worker-v2.js \
  --name agent-worker-swarm-falcon \
  --cwd /opt/nexusgenesis \
  --max-memory-restart 80M \
  --log /var/log/nexusgenesis/worker-falcon-out.log \
  --error /var/log/nexusgenesis/worker-falcon-error.log \
  --time \
  -- --agent swarm-falcon-1782900000000-5 --interval 70000 2>/dev/null || \
  pm2 restart agent-worker-swarm-falcon 2>/dev/null || true

pm2 start scripts/agent-worker-v2.js \
  --name agent-worker-swarm-oracle \
  --cwd /opt/nexusgenesis \
  --max-memory-restart 80M \
  --log /var/log/nexusgenesis/worker-oracle-out.log \
  --error /var/log/nexusgenesis/worker-oracle-error.log \
  --time \
  -- --agent swarm-oracle-1782900000000-6 --interval 85000 2>/dev/null || \
  pm2 restart agent-worker-swarm-oracle 2>/dev/null || true

pm2 start scripts/agent-worker-v2.js \
  --name agent-worker-swarm-prism \
  --cwd /opt/nexusgenesis \
  --max-memory-restart 80M \
  --log /var/log/nexusgenesis/worker-prism-out.log \
  --error /var/log/nexusgenesis/worker-prism-error.log \
  --time \
  -- --agent swarm-prism-1782900000000-7 --interval 95000 2>/dev/null || \
  pm2 restart agent-worker-swarm-prism 2>/dev/null || true

echo "  ✓ falcon, oracle, prism started"

# ─── 5. Save PM2 config ───
echo "[5/6] Saving PM2 config..."
pm2 save

# ─── 6. Report status ───
echo "[6/6] Status report:"
echo ""
echo "=== PM2 Processes ==="
pm2 list
echo ""
echo "=== Memory ==="
free -m
echo ""
echo "=== Network Status ==="
curl -s http://127.0.0.1:19891/api/v1/bootstrap/status 2>/dev/null | \
  python3 -c 'import sys,json;d=json.load(sys.stdin);print(f"block={d[\"blockHeight\"]} agents={d[\"agentCount\"]} validators={d[\"validatorCount\"]}")' 2>/dev/null || echo "API not responding yet"

echo ""
echo "══════════════════════════════════════════════════"
echo "  Done. node03 stopped, 3 new agents started."
echo "  Agents: 5(original) + 3(new) = 8 total"
echo "══════════════════════════════════════════════════"
