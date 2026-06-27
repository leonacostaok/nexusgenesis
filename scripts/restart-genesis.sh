#!/bin/bash
set -e
echo '=== Restart genesis with new 500M memory limit ==='
echo '--- Current genesis state ---'
pm2 show nexusgenesis-genesis 2>&1 | grep -iE 'status|restarts|max memory|uptime' | head -5

echo
echo '--- Block height before restart ---'
curl -s http://localhost:19891/api/v1/bootstrap/status 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print('Block height:', d.get('blockHeight', d.get('block_height', '?')))" 2>/dev/null || echo '(could not get block height)'

echo
echo '=== Delete and restart genesis ==='
cd /opt/nexusgenesis
pm2 delete nexusgenesis-genesis 2>&1 | tail -2
pm2 start ecosystem.config.cjs --only nexusgenesis-genesis 2>&1 | tail -3

echo
echo '=== Wait 15s for startup ==='
sleep 15

echo '=== Genesis status after restart ==='
pm2 show nexusgenesis-genesis 2>&1 | grep -iE 'status|restarts|max memory|uptime' | head -5

echo
echo '=== Verify API is back ==='
curl -s -o /dev/null -w "HTTP %{http_code} in %{time_total}s\n" http://localhost:19891/health 2>&1

echo
echo '=== Block height after restart ==='
curl -s http://localhost:19891/api/v1/bootstrap/status 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print('Block height:', d.get('blockHeight', d.get('block_height', '?')))" 2>/dev/null || echo '(could not get block height)'

echo
echo '=== Recent genesis log (last 15 lines) ==='
tail -15 /root/.pm2/logs/nexusgenesis-genesis-out.log 2>/dev/null
