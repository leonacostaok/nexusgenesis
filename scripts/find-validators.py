import urllib.request
import json

BASE = 'http://localhost:19891'

def api_call(endpoint, method='GET', data=None, headers=None):
    url = f'{BASE}{endpoint}'
    req = urllib.request.Request(url, method=method)
    if headers:
        for k, v in headers.items():
            req.add_header(k, v)
    if data:
        req.data = json.dumps(data).encode()
    try:
        resp = urllib.request.urlopen(req, timeout=10)
        return json.loads(resp.read().decode())
    except Exception as e:
        return {'error': str(e)}

print("=== Find Validators ===\n")
agents = api_call('/api/v1/bootstrap/agents')
validators = []
for agent in agents.get('agents', []):
    if agent.get('is_validator'):
        validators.append(agent)
        print(f"Validator: {agent.get('agent_identity', 'unknown')}")
        print(f"  address: {agent.get('address', 'unknown')}")
        print(f"  locked: {agent.get('validator_stake_locked_amount', '0')}")
        print()

if not validators:
    print("No validators found. Listing all agents:")
    for a in agents.get('agents', [])[:5]:
        print(f"  - {a.get('agent_identity', 'unknown')} | is_validator={a.get('is_validator', False)}")
    exit(0)

v = validators[0]
print(f"\n=== Test Slash on {v['agent_identity']} ===")
slash_result = api_call(
    '/api/v1/admin/validator-slash',
    method='POST',
    data={'agent_identity': v['agent_identity'], 'violation': 'downtime'},
    headers={'x-admin-secret': 'devnet-endow-2026'}
)
print(f"Slash result: {json.dumps(slash_result, indent=2)}\n")
