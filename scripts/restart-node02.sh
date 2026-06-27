#!/bin/bash
set -e
echo '=== Step 1: Backup node02 data ==='
BACKUP_DIR="/opt/nexusgenesis/data/node02-backup-$(date +%Y%m%d-%H%M%S)"
cp -r /opt/nexusgenesis/data/node02 "$BACKUP_DIR"
echo "Backed up to: $BACKUP_DIR"
du -sh "$BACKUP_DIR"

echo
echo '=== Step 2: Stop and delete node02 from PM2 ==='
pm2 stop nexusgenesis-node02 2>&1 | tail -3
pm2 delete nexusgenesis-node02 2>&1 | tail -3

echo
echo '=== Step 3: Start node02 with ecosystem.config.cjs (new 400M limit) ==='
cd /opt/nexusgenesis
pm2 start ecosystem.config.cjs --only nexusgenesis-node02 2>&1 | tail -5

echo
echo '=== Step 4: Wait 8s and check status ==='
sleep 8
pm2 show nexusgenesis-node02 2>&1 | grep -iE 'status|memory|restart|uptime' | head -5

echo
echo '=== Step 5: Check recent log for recovery loop ==='
sleep 5
tail -20 /root/.pm2/logs/nexusgenesis-node02-out.log 2>/dev/null

echo
echo '=== Done ==='
echo "Backup at: $BACKUP_DIR"
