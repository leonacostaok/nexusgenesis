#!/bin/bash
# Verify deployment of Dashboard fix + task publisher fix + taskProtocol fix
echo "=== [1] Dashboard API: wallet field ==="
curl -s http://127.0.0.1:19891/api/v1/bootstrap/agents | python3 -c "
import sys, json
d = json.load(sys.stdin)
agents = d.get('agents', [])
print(f'Agent count: {len(agents)}')
for a in agents[:8]:
    name = a.get('agent_identity', '?')[:25]
    bal = a.get('wallet', {}).get('balance', 'MISSING')
    print(f'  {name:25s} wallet.balance={bal}')
"

echo ""
echo "=== [2] Open tasks count ==="
curl -s 'http://127.0.0.1:19891/api/tasks?status=open&limit=50' | python3 -c "
import sys, json
d = json.load(sys.stdin)
tasks = d.get('tasks', [])
print(f'Open tasks: {len(tasks)}')
for t in tasks[:5]:
    tid = t.get('id', '?')[:20]
    reward = t.get('reward', '?')
    ttype = t.get('taskType', '?')
    print(f'  {tid:20s} reward={reward} type={ttype}')
"

echo ""
echo "=== [3] Chain alignment (3 nodes) ==="
for port in 19891 19892 19893; do
  echo -n "port $port: "
  curl -s http://127.0.0.1:$port/api/v1/bootstrap/status | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(f'height={d.get(\"blockHeight\",0)} agents={d.get(\"agentCount\",0)} validators={d.get(\"validatorCount\",0)}')
"
done

echo ""
echo "=== [4] system-publisher recent logs (last 20 lines) ==="
pm2 logs system-publisher --nostream --lines 20 2>/dev/null | tail -20

echo ""
echo "=== [5] Task stats ==="
curl -s http://127.0.0.1:19891/api/tasks/stats | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(json.dumps(d, indent=2))
" 2>/dev/null || echo "(stats endpoint not available)"
