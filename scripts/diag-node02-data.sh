#!/bin/bash
echo '=== node02 data dir ==='
du -sh /opt/nexusgenesis/data/node02 2>/dev/null
ls -la /opt/nexusgenesis/data/node02/ 2>/dev/null | head -20

echo
echo '=== node02 state ==='
ls -la /opt/nexusgenesis/data/node02/state/ 2>/dev/null | head -10
echo '--- blockchainState.json size ---'
ls -lah /opt/nexusgenesis/data/node02/state/blockchainState.json 2>/dev/null

echo
echo '=== node03 data dir (for comparison) ==='
du -sh /opt/nexusgenesis/data/node03 2>/dev/null
ls -la /opt/nexusgenesis/data/node03/ 2>/dev/null | head -10

echo
echo '=== genesis data dir ==='
du -sh /opt/nexusgenesis/data/genesis 2>/dev/null
ls -la /opt/nexusgenesis/data/genesis/ 2>/dev/null | head -10

echo
echo '=== check if node02 has its own snapshots ==='
ls /opt/nexusgenesis/data/node02/state/snapshots/ 2>/dev/null | head -5
echo "snapshot count: $(ls /opt/nexusgenesis/data/node02/state/snapshots/ 2>/dev/null | wc -l)"
