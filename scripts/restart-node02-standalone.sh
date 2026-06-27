#!/bin/bash
set -e
echo '=== Restart node02 with new config (standalone mode) ==='
cd /opt/nexusgenesis
pm2 delete nexusgenesis-node02 2>&1 | tail -2
pm2 start ecosystem.config.cjs --only nexusgenesis-node02 2>&1 | tail -3

echo
echo '=== Wait 12s for startup ==='
sleep 12

echo '=== node02 status ==='
pm2 show nexusgenesis-node02 2>&1 | grep -iE 'status|memory|restart|uptime' | head -5

echo
echo '=== Check if recovery loop stopped (last 20 lines) ==='
tail -20 /root/.pm2/logs/nexusgenesis-node02-out.log 2>/dev/null

echo
echo '=== Recovery loop count in last 50 lines ==='
tail -50 /root/.pm2/logs/nexusgenesis-node02-out.log 2>/dev/null | grep -c 'RecoveryManager'
