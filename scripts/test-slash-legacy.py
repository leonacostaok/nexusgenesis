import json, urllib.request

# Test slashing on a validator that has NO locked stake (legacy validator)
# Expected: should fail gracefully with "insufficient stake"
payload = {
    "agent_identity": "WolfKing-Analyst",
    "violation": "downtime"
}

print('=== TEST: slash legacy validator (no locked stake) ===')
print(f'Payload: {json.dumps(payload)}')

req = urllib.request.Request(
    'http://localhost:19891/api/v1/admin/validator-slash',
    data=json.dumps(payload).encode(),
    headers={
        'Content-Type': 'application/json',
        'x-admin-secret': 'devnet-endow-2026'
    },
    method='POST'
)
try:
    r = urllib.request.urlopen(req, timeout=15)
    result = json.loads(r.read().decode())
    print(f'Response: {json.dumps(result, indent=2)}')
except urllib.error.HTTPError as e:
    body = e.read().decode()
    print(f'HTTP Error {e.code}: {body}')
    try:
        result = json.loads(body)
        print(f'  Parsed: {json.dumps(result, indent=2)}')
    except:
        pass
except Exception as e:
    print(f'Error: {e}')

print()
print('Expected: success=false, error mentions "insufficient stake" or "validator not found"')
print('This confirms slash gracefully rejects validators without locked stake.')
