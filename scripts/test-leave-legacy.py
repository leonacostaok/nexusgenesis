import json, urllib.request

# Test leave on a legacy validator (no locked stake)
# Should still succeed and clear validator status, just refund 0
payload = {
    "agent_identity": "WolfKing-Analyst",
    "address": "ng112AhL1hSweRdm5VovJvGibrgSog"
}

# First get full address from API
url = 'http://localhost:19891/api/v1/agents'
r = urllib.request.urlopen(url, timeout=15)
data = json.loads(r.read().decode())
agents = data.get('agents') or []
wolf = None
for a in agents:
    if a.get('agent_identity') == 'WolfKing-Analyst' or a.get('identity') == 'WolfKing-Analyst':
        wolf = a
        break

if not wolf:
    print('WolfKing-Analyst not found')
    exit(1)

addr = wolf.get('address')
print(f'WolfKing-Analyst address: {addr}')
print(f'is_validator before: {wolf.get("is_validator")}')

payload['address'] = addr

print()
print('=== TEST: leave legacy validator (no locked stake) ===')
req = urllib.request.Request(
    'http://localhost:19891/api/v1/validators/leave',
    data=json.dumps(payload).encode(),
    headers={'Content-Type': 'application/json'},
    method='POST'
)
try:
    r = urllib.request.urlopen(req, timeout=15)
    result = json.loads(r.read().decode())
    print(f'Response: {json.dumps(result, indent=2)}')
except urllib.error.HTTPError as e:
    body = e.read().decode()
    print(f'HTTP Error {e.code}: {body}')
except Exception as e:
    print(f'Error: {e}')

print()
print('Expected: success=true, refunded=0 (no locked stake to refund)')
print('Validator status should be cleared.')
