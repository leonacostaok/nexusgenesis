#!/bin/bash
# Deploy 3 new agent workers + sync ecosystem config
# Run on server after SSH recovers.

set -e

cd /opt/nexusgenesis

# Pull latest code
echo "=== Pulling latest code ==="
git pull origin master

# Start 3 new agent workers with 80M memory limit each
echo "=== Starting new agent workers ==="
pm2 start scripts/agent-worker-v2.js \
  --name agent-worker-swarm-falcon \
  --cwd /opt/nexusgenesis \
  --max-memory-restart 80M \
  --log /var/log/nexusgenesis/worker-falcon-out.log \
  --error /var/log/nexusgenesis/worker-falcon-error.log \
  --time \
  -- --agent swarm-falcon-1782900000000-5 --interval 70000

pm2 start scripts/agent-worker-v2.js \
  --name agent-worker-swarm-oracle \
  --cwd /opt/nexusgenesis \
  --max-memory-restart 80M \
  --log /var/log/nexusgenesis/worker-oracle-out.log \
  --error /var/log/nexusgenesis/worker-oracle-error.log \
  --time \
  -- --agent swarm-oracle-1782900000000-6 --interval 85000

pm2 start scripts/agent-worker-v2.js \
  --name agent-worker-swarm-prism \
  --cwd /opt/nexusgenesis \
  --max-memory-restart 80M \
  --log /var/log/nexusgenesis/worker-prism-out.log \
  --error /var/log/nexusgenesis/worker-prism-error.log \
  --time \
  -- --agent swarm-prism-1782900000000-7 --interval 95000

pm2 save

echo ""
echo "=== Status ==="
pm2 list
echo ""
echo "=== Memory ==="
free -m
echo ""
echo "=== API Status ==="
curl -s http://127.0.0.1:19891/api/v1/bootstrap/status | python3 -c 'import sys,json;d=json.load(sys.stdin);print(f"block={d[\"blockHeight\"]} agents={d[\"agentCount\"]} validators={d[\"validatorCount\"]}")'
