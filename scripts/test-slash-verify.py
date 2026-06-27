import json, urllib.request

addresses = {
    'atlas': 'ng112HGkjkngBEDqfYkxcKqfyQZyFMcBwM1Jjy1KQF1DSi14tTYNKn',
    'staking': 'ng1staking00000000000000000000000000000',
    'burn': 'ng1burn0000000000000000000000000000000'
}

print('=== BALANCE CHECK AFTER SLASH ===')
for label, addr in addresses.items():
    try:
        url = f'http://localhost:19891/api/v1/wallet/balance/{addr}'
        r = urllib.request.urlopen(url, timeout=10)
        d = json.loads(r.read().decode())
        bal = d.get('wallet', {}).get('balance', '?')
        print(f'  {label}: {bal} NGEN  ({addr[:30]}...)')
    except Exception as e:
        print(f'  {label}: ERROR {e}')

print()
print('Expected after downtime slash (1% of 500 = 5):')
print('  atlas:     1000 (unchanged - slash from staking, not wallet)')
print('  staking:   495  (500 - 5 slashed)')
print('  burn:      5    (slashed NGEN burned)')
