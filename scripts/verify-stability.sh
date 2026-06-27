#!/bin/bash
echo '=== Wait 25s to observe stability ==='
sleep 25

echo '=== All PM2 processes ==='
pm2 list 2>&1 | grep -E 'name|nexusgenesis|agent-worker|moltbook|system-pub' | head -15

echo
echo '=== node02 stability check ==='
pm2 show nexusgenesis-node02 2>&1 | grep -iE 'status|restarts|uptime|memory' | head -5
echo '--- RecoveryManager lines in last 30s of node02 log ---'
tail -100 /root/.pm2/logs/nexusgenesis-node02-out.log 2>/dev/null | grep -c 'RecoveryManager'

echo
echo '=== genesis restart cause investigation ==='
echo '--- genesis error log (last 30 lines) ---'
tail -30 /root/.pm2/logs/nexusgenesis-error.log 2>/dev/null
echo
echo '--- genesis recent crashes (grep for crash/error/fatal) ---'
grep -iE 'fatal|crash|uncaught|SIGTERM|OOM|heap out' /root/.pm2/logs/nexusgenesis-error.log 2>/dev/null | tail -10

echo
echo '=== genesis memory trend (last 5 min) ==='
pm2 show nexusgenesis-genesis 2>&1 | grep -iE 'memory|restarts|uptime' | head -3
