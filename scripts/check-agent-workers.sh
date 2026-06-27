#!/bin/bash
echo '=== drift worker status ==='
pm2 show agent-worker-drift 2>&1 | grep -iE 'status|restarts|uptime|memory' | head -5
echo '--- drift recent log (last 10 lines) ---'
tail -10 /root/.pm2/logs/agent-worker-drift-out.log 2>/dev/null
echo '--- drift errors (last 5 lines) ---'
tail -5 /root/.pm2/logs/agent-worker-drift-error.log 2>/dev/null

echo
echo '=== echo worker status ==='
pm2 show agent-worker-echo 2>&1 | grep -iE 'status|restarts|uptime|memory' | head -5
echo '--- echo recent log (last 10 lines) ---'
tail -10 /root/.pm2/logs/agent-worker-echo-out.log 2>/dev/null
echo '--- echo errors (last 5 lines) ---'
tail -5 /root/.pm2/logs/agent-worker-echo-error.log 2>/dev/null

echo
echo '=== All agent workers summary ==='
for w in atlas beacon cipher drift echo; do
  echo "--- agent-worker-$w ---"
  pm2 show agent-worker-$w 2>&1 | grep -iE 'status|restarts|uptime' | head -3
done
