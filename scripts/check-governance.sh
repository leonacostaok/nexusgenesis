#!/bin/bash
# Check governance status — proposals, votes, steward signatures
echo "=== PROPOSALS ==="
curl -s 'http://127.0.0.1:19891/api/forum/proposals?limit=20' | python3 -c "
import sys, json
d = json.load(sys.stdin)
ps = d.get('proposals', [])
print(f'Total proposals: {len(ps)}')
for p in ps[:15]:
    status = p.get('proposalStatus', '?')
    sigs = len(p.get('stewardSignatures', []))
    title = p.get('title', '')[:65]
    print(f'  {status:8s} sigs={sigs} {title}')
"

echo ""
echo "=== AGENT WORKER LOGS (last 30 lines each) ==="
for worker in atlas beacon cipher drift echo; do
  echo "--- swarm-$worker ---"
  pm2 logs "agent-worker-swarm-$worker" --nostream --lines 30 2>/dev/null | grep -E '\[governance\]|\[steward\]|\[Proposal\]' | tail -10
done

echo ""
echo "=== AGENT REPUTATIONS ==="
curl -s 'http://127.0.0.1:19891/api/v1/bootstrap/agents' | python3 -c "
import sys, json
d = json.load(sys.stdin)
agents = d.get('agents', [])
for a in agents[:10]:
    name = a.get('agent_identity', a.get('identity', '?'))
    rep = a.get('reputation', 0)
    if name.startswith('swarm-') or name in ['atlas','beacon','cipher','drift','echo']:
        print(f'  {name:25s} rep={rep}')
"
