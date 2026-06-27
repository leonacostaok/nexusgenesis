import json, urllib.request

# Get all agents
url = 'http://localhost:19891/api/v1/agents'
r = urllib.request.urlopen(url, timeout=15)
data = json.loads(r.read().decode())
agents = data.get('agents') or []
validators = [a for a in agents if a.get('is_validator')]

print(f'Active validators: {len(validators)}')
for v in validators:
    ident = v.get('agent_identity') or v.get('identity') or '?'
    addr = v.get('address', '?')
    stake = v.get('validator_stake_locked_amount', '?')
    print(f'  {ident}: stake={stake} addr={addr[:30]}...')

# Get balances for staking pool
staking_addr = 'ng1staking00000000000000000000000000000'
url = f'http://localhost:19891/api/v1/wallet/balance/{staking_addr}'
r = urllib.request.urlopen(url, timeout=10)
d = json.loads(r.read().decode())
print(f'\nStaking pool balance: {d.get("wallet",{}).get("balance")} NGEN')
