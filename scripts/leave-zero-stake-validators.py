import json, urllib.request

# Get agents list and find the 3 stake=0 validators
url = 'http://localhost:19891/api/v1/agents'
r = urllib.request.urlopen(url, timeout=15)
data = json.loads(r.read().decode())
agents = data.get('agents') or []

validators = [a for a in agents if a.get('is_validator')]
print(f'Validators to process: {len(validators)}')

for v in validators:
    ident = v.get('agent_identity') or v.get('identity') or '?'
    addr = v.get('address')
    stake = v.get('validator_stake_locked_amount', '0')
    print(f'\n=== Leaving: {ident} (stake={stake}, addr={addr[:25]}...) ===')

    payload = {'agent_identity': ident, 'address': addr}
    req = urllib.request.Request(
        'http://localhost:19891/api/v1/validators/leave',
        data=json.dumps(payload).encode(),
        headers={'Content-Type': 'application/json'},
        method='POST'
    )
    try:
        r = urllib.request.urlopen(req, timeout=15)
        result = json.loads(r.read().decode())
        print(f'  Response: {json.dumps(result)}')
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f'  HTTP Error {e.code}: {body}')
    except Exception as e:
        print(f'  Error: {e}')

print('\n=== FINAL VALIDATOR LIST ===')
r = urllib.request.urlopen(url, timeout=15)
data = json.loads(r.read().decode())
agents = data.get('agents') or []
validators = [a for a in agents if a.get('is_validator')]
print(f'Remaining validators: {len(validators)}')
for v in validators:
    ident = v.get('agent_identity') or v.get('identity') or '?'
    print(f'  - {ident}')
