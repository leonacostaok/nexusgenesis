#!/bin/bash
echo '=== server ecosystem.config.cjs (memory lines) ==='
grep -E 'name|max_memory|memory' /opt/nexusgenesis/ecosystem.config.cjs 2>&1

echo
echo '=== pm2 actual max_memory_restart for each node ==='
for p in nexusgenesis-genesis nexusgenesis-node02 nexusgenesis-node03; do
  echo "--- $p ---"
  pm2 show "$p" 2>&1 | grep -iE 'memory|restarts|uptime' | head -5
done

echo
echo '=== current process RSS memory ==='
pm2 list 2>&1 | head -25
