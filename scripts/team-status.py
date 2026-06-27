import json, urllib.request

url = 'http://localhost:19891/api/v1/agents'
r = urllib.request.urlopen(url, timeout=15)
data = json.loads(r.read().decode())
agents = data.get('agents') or []

validators = [a for a in agents if a.get('is_validator')]
regular = [a for a in agents if not a.get('is_validator')]

print(f'TOTAL_AGENTS={len(agents)}')
print(f'VALIDATORS={len(validators)}')
print(f'REGULAR={len(regular)}')

print('\n## VALIDATORS')
for v in validators:
    ident = v.get('agent_identity') or v.get('identity') or '?'
    rep = v.get('reputation', 0)
    stake = v.get('validator_stake_locked_amount', '0')
    print(f'- {ident} | rep={rep} | stake={stake}')

print('\n## REGULAR AGENTS')
for a in regular:
    ident = a.get('agent_identity') or a.get('identity') or '?'
    rep = a.get('reputation', 0)
    status = a.get('status', '?')
    print(f'- {ident} | status={status} | rep={rep}')
