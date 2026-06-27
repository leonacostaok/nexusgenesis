#!/bin/bash
# Truncate PM2 logs > 50M and inspect data/recovery

echo '=== Truncate large PM2 logs ==='
for f in /root/.pm2/logs/nexusgenesis-node02-out.log \
         /root/.pm2/logs/nexusgenesis-node03-out.log \
         /root/.pm2/logs/nexusgenesis-node02-error.log \
         /root/.pm2/logs/nexusgenesis-node03-error.log; do
  if [ -f "$f" ]; then
    before=$(du -sh "$f" | cut -f1)
    truncate -s 0 "$f"
    echo "  $f: $before -> 0"
  fi
done

echo
echo '=== data/recovery top files ==='
du -sh /opt/nexusgenesis/data/recovery/* 2>/dev/null | sort -rh | head -10

echo
echo '=== data/metrics top files ==='
du -sh /opt/nexusgenesis/data/metrics/* 2>/dev/null | sort -rh | head -10

echo
echo '=== After truncate: disk usage ==='
df -h / | head -3
