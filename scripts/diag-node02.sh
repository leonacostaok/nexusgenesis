#!/bin/bash
echo '=== node02 CPU 100% diagnosis ==='
echo '--- top processes ---'
ps aux --sort=-%cpu | head -8

echo
echo '--- node02 recent error log (last 40 lines) ---'
tail -40 /root/.pm2/logs/nexusgenesis-node02-error.log 2>/dev/null

echo
echo '--- node02 recent out log (last 30 lines) ---'
tail -30 /root/.pm2/logs/nexusgenesis-node02-out.log 2>/dev/null

echo
echo '--- check if node02 is in busy loop (count block produces last 1 min) ---'
date
tail -100 /root/.pm2/logs/nexusgenesis-node02-out.log 2>/dev/null | grep -c 'Created block'
