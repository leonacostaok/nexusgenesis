import json, urllib.request

atlas_addr = 'ng112HGkjkngBEDqfYkxcKqfyQZyFMcBwM1Jjy1KQF1DSi14tTYNKn'
staking_addr = 'ng1staking00000000000000000000000000000'

def get_balance(addr):
    url = f'http://localhost:19891/api/v1/wallet/balance/{addr}'
    r = urllib.request.urlopen(url, timeout=10)
    d = json.loads(r.read().decode())
    return d.get('wallet', {}).get('balance', '?')

print('=== BEFORE LEAVE ===')
print(f'  atlas balance:   {get_balance(atlas_addr)}')
print(f'  staking pool:    {get_balance(staking_addr)}')

# Create leave request
leave_payload = {
    "agent_identity": "swarm-atlas-1782045381627-0",
    "address": atlas_addr
}
with open("/tmp/leave.json", "w") as f:
    json.dump(leave_payload, f)

print()
print('=== CALLING LEAVE ===')
req = urllib.request.Request(
    'http://localhost:19891/api/v1/validators/leave',
    data=json.dumps(leave_payload).encode(),
    headers={'Content-Type': 'application/json'},
    method='POST'
)
try:
    r = urllib.request.urlopen(req, timeout=15)
    result = json.loads(r.read().decode())
    print('  Response:', json.dumps(result, indent=2))
except urllib.error.HTTPError as e:
    print(f'  HTTP Error {e.code}: {e.read().decode()}')
except Exception as e:
    print(f'  Error: {e}')

print()
print('=== AFTER LEAVE ===')
print(f'  atlas balance:   {get_balance(atlas_addr)}')
print(f'  staking pool:    {get_balance(staking_addr)}')

print()
print('Expected after leave (refund 495 from staking):')
print('  atlas:     1000 + 495 = 1495')
print('  staking:   495 - 495 = 0')
