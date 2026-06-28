#!/bin/bash
# High-difficulty task scenario test
# Verifies agent reputation growth unlocks progressively harder tasks
# Run on server: bash /tmp/test-high-difficulty.sh

API="http://127.0.0.1:19891"
PUBLISHER="ng1swarmpool000000000000000000000000000"

echo "=========================================="
echo "  High-Difficulty Task Scenario Test"
echo "=========================================="
echo

echo "=== Phase 1: Current Agent Reputation Baseline ==="
curl -s "$API/api/v1/bootstrap/agents" | python3 -c "
import sys, json
d = json.load(sys.stdin)
agents = d.get('agents', [])
print('Current reputation baseline:')
swarm = [a for a in agents if 'swarm-' in a.get('agent_identity', '')]
for a in sorted(swarm, key=lambda x: x.get('reputation', 0), reverse=True):
    aid = a.get('agent_identity', '?')[:30]
    rep = a.get('reputation', 0)
    bal = a.get('wallet', {}).get('balance', 'N/A') if isinstance(a.get('wallet'), dict) else 'N/A'
    print(f'  {aid:30s} rep={rep:>3}  bal={bal}')
"
echo

echo "=== Phase 2: Publishing High-Difficulty Tasks ==="
echo "Publishing 3 tiers of high-difficulty tasks..."
echo

# Tier 1: minRep=15 (atlas needs +2 to reach 15)
echo "--- Tier 1: minRep=15 (Advanced tasks) ---"
TIER1=(
  '{"agent_identity":"'"$PUBLISHER"'","title":"Advanced consensus fault tolerance analysis","description":"Deep analysis of consensus mechanism under Byzantine fault conditions. Requires advanced understanding of BFT algorithms.","requiredCapabilities":["analysis"],"taskType":"analysis","reward":"300"}'
  '{"agent_identity":"'"$PUBLISHER"'","title":"Cross-validator signature scheme audit","description":"Audit the multi-signature scheme used in validator voting. Identify potential attack vectors.","requiredCapabilities":["security_audit"],"taskType":"security_audit","reward":"350"}'
  '{"agent_identity":"'"$PUBLISHER"'","title":"P2P network partition recovery strategy","description":"Design and document a recovery strategy for network partitions. Must handle chain reorganization.","requiredCapabilities":["coding"],"taskType":"coding","reward":"320"}'
)

# Tier 2: minRep=20 (requires significant reputation)
echo "--- Tier 2: minRep=20 (Expert tasks) ---"
TIER2=(
  '{"agent_identity":"'"$PUBLISHER"'","title":"Design post-quantum signature migration plan","description":"Comprehensive plan for migrating from current signatures to post-quantum cryptography. Must include timeline and risk assessment.","requiredCapabilities":["security_audit"],"taskType":"security_audit","reward":"500"}'
  '{"agent_identity":"'"$PUBLISHER"'","title":"Economic model stress test under adversarial conditions","description":"Simulate economic attacks: sybil, whale manipulation, reward gaming. Propose mitigations.","requiredCapabilities":["analysis"],"taskType":"analysis","reward":"450"}'
  '{"agent_identity":"'"$PUBLISHER"'","title":"Implement zero-knowledge proof verification layer","description":"Design ZK proof verification for private transactions. Include circuit design and verification logic.","requiredCapabilities":["coding"],"taskType":"coding","reward":"480"}'
)

# Tier 3: minRep=30 (Ultimate challenge)
echo "--- Tier 3: minRep=30 (Master tasks) ---"
TIER3=(
  '{"agent_identity":"'"$PUBLISHER"'","title":"Design decentralized oracle integration architecture","description":"Architect a decentralized oracle network for external data feeds. Must include consensus on data validity and slashing for false reports.","requiredCapabilities":["coding","security_audit"],"taskType":"coding","reward":"800"}'
  '{"agent_identity":"'"$PUBLISHER"'","title":"Full protocol security audit with formal verification","description":"Complete security audit using formal verification methods. Must prove correctness of critical paths.","requiredCapabilities":["security_audit"],"taskType":"security_audit","reward":"1000"}'
)

# Custom minReputation override via API
publish_with_minrep() {
    local task_json="$1"
    local minrep="$2"
    # Add minReputation to the JSON
    local modified=$(echo "$task_json" | python3 -c "
import sys, json
d = json.load(sys.stdin)
d['minReputation'] = $minrep
print(json.dumps(d))
")
    local result=$(curl -s -X POST "$API/api/tasks" -H "Content-Type: application/json" -d "$modified")
    echo "$result" | python3 -c "
import sys, json
d = json.load(sys.stdin)
t = d.get('task', {})
print(f'  {\"✓\" if d.get(\"success\") else \"✗\"} minRep={t.get(\"minReputation\",\"?\"):>3}  reward={t.get(\"reward\",\"?\"):>4} NGEN  type={t.get(\"taskType\",\"?\"):>15}  id={t.get(\"id\",\"?\")[:25]}  title={t.get(\"title\",\"?\")[:50]}')
" 2>/dev/null || echo "  ✗ Failed: $result"
}

echo "Publishing Tier 1 (minRep=15):"
for task in "${TIER1[@]}"; do
    publish_with_minrep "$task" 15
done

echo
echo "Publishing Tier 2 (minRep=20):"
for task in "${TIER2[@]}"; do
    publish_with_minrep "$task" 20
done

echo
echo "Publishing Tier 3 (minRep=30):"
for task in "${TIER3[@]}"; do
    publish_with_minrep "$task" 30
done

echo
echo "=== Phase 3: Task Market Overview ==="
curl -s "$API/api/tasks?status=open&limit=50" | python3 -c "
import sys, json
d = json.load(sys.stdin)
tasks = d.get('tasks', [])
print(f'Total open tasks: {len(tasks)}')
print()
from collections import Counter
rep_tiers = Counter()
for t in tasks:
    mr = t.get('minReputation', 0)
    if mr >= 30: rep_tiers['Tier 3 (minRep>=30)'] += 1
    elif mr >= 20: rep_tiers['Tier 2 (minRep>=20)'] += 1
    elif mr >= 15: rep_tiers['Tier 1 (minRep>=15)'] += 1
    elif mr >= 10: rep_tiers['Advanced (minRep>=10)'] += 1
    elif mr >= 5: rep_tiers['Intermediate (minRep>=5)'] += 1
    else: rep_tiers['Beginner (minRep=0)'] += 1
print('Tasks by difficulty tier:')
for tier, count in sorted(rep_tiers.items(), key=lambda x: x[0]):
    print(f'  {tier}: {count}')
print()
print('High-difficulty tasks (minRep>=15):')
for t in tasks:
    mr = t.get('minReputation', 0)
    if mr >= 15:
        print(f'  minRep={mr:>3}  reward={t.get(\"reward\",\"?\"):>4}  type={t.get(\"taskType\",\"?\"):>15}  title={t.get(\"title\",\"?\")[:50]}')
"
echo

echo "=== Phase 4: Monitoring Agent Progression (5 minutes) ==="
echo "Watching agent reputation growth and task unlocks..."
echo

for i in 1 2 3 4 5; do
    echo "--- Check #$i (after ${i}m) ---"
    curl -s "$API/api/v1/bootstrap/agents" | python3 -c "
import sys, json
d = json.load(sys.stdin)
agents = d.get('agents', [])
swarm = [a for a in agents if 'swarm-' in a.get('agent_identity', '')]
for a in sorted(swarm, key=lambda x: x.get('reputation', 0), reverse=True):
    aid = a.get('agent_identity', '?')[:25]
    rep = a.get('reputation', 0)
    bal = a.get('wallet', {}).get('balance', 'N/A') if isinstance(a.get('wallet'), dict) else 'N/A'
    # Show which tiers are unlocked
    tiers = []
    if rep >= 15: tiers.append('T1')
    if rep >= 20: tiers.append('T2')
    if rep >= 30: tiers.append('T3')
    tier_str = '/'.join(tiers) if tiers else '-'
    print(f'  {aid:25s} rep={rep:>3}  bal={bal:>6}  unlocked=[{tier_str}]')
"
    curl -s "$API/api/tasks/stats" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(f'  Tasks: total={d.get(\"total\")} open={d.get(\"open\")} completed={d.get(\"completed\")} rewards={d.get(\"totalRewardsDistributed\")}')
"
    if [ $i -lt 5 ]; then
        echo "  (waiting 60s...)"
        sleep 60
    fi
done

echo
echo "=== Phase 5: High-Difficulty Task Completion Check ==="
echo "Checking if any Tier 1/2/3 tasks were completed..."
curl -s "$API/api/tasks?status=completed&limit=50" | python3 -c "
import sys, json
d = json.load(sys.stdin)
tasks = d.get('tasks', [])
print(f'Total completed tasks: {len(tasks)}')
print()
# Find recently completed high-difficulty tasks
high_diff = [t for t in tasks if t.get('minReputation', 0) >= 15]
print(f'High-difficulty tasks completed (minRep>=15): {len(high_diff)}')
for t in high_diff[:10]:
    print(f'  minRep={t.get(\"minReputation\",0):>3}  reward={t.get(\"reward\",\"?\"):>4}  type={t.get(\"taskType\",\"?\"):>15}  title={t.get(\"title\",\"?\")[:50]}')
    sub = t.get('submissionSummary')
    if sub:
        print(f'    submission.type={sub.get(\"type\",\"?\")}  fields={sub.get(\"fields\",[])}')
"

echo
echo "=== Phase 6: Agent Worker Activity ==="
for worker in atlas beacon cipher drift echo; do
    echo "--- $worker (last 15 lines) ---"
    pm2 logs agent-worker-swarm-$worker --nostream --lines 15 2>/dev/null | tail -15
    echo
done

echo
echo "=== Phase 7: Reputation Reward Logs ==="
pm2 logs nexusgenesis-genesis --nostream --lines 500 2>/dev/null | grep -E "(REPUTATION|Reputation|TaskProtocol.*completed|TaskProtocol.*Reward)" | tail -20

echo
echo "=========================================="
echo "  Test Complete"
echo "=========================================="
