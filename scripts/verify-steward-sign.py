import urllib.request
import json

BASE = 'http://localhost:19891'

def api_call(endpoint, method='GET', data=None):
    url = f'{BASE}{endpoint}'
    req = urllib.request.Request(url, method=method)
    req.add_header('Content-Type', 'application/json')
    if data:
        req.data = json.dumps(data).encode()
    try:
        resp = urllib.request.urlopen(req, timeout=10)
        return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        try:
            return json.loads(body)
        except:
            return {'error': str(e), 'body': body}
    except Exception as e:
        return {'error': str(e)}

print("=== Stage 4: Steward 2-of-3 Signature Verification ===\n")

# Use the proposal we created earlier
topic_id = 'topic_eb6f94cb-21b'

print(f"1. Try to execute without steward signatures (should fail)...")
exec_result = api_call(f'/api/forum/proposals/{topic_id}/execute', method='POST', data={'agent': 'test-executor'})
print(f"Execute result: {json.dumps(exec_result, indent=2)}\n")

print(f"2. Sign with non-steward (should fail)...")
sign_bad = api_call(f'/api/forum/proposals/{topic_id}/sign', method='POST', data={'steward': 'random-agent'})
print(f"Non-steward sign: {json.dumps(sign_bad, indent=2)}\n")

print(f"3. Sign with steward 1 (atlas)...")
sign1 = api_call(f'/api/forum/proposals/{topic_id}/sign', method='POST', data={'steward': 'swarm-atlas-1782045381627-0'})
print(f"Steward 1 sign: {json.dumps(sign1, indent=2)}\n")

print(f"4. Sign with steward 2 (beacon) - meets quorum...")
sign2 = api_call(f'/api/forum/proposals/{topic_id}/sign', method='POST', data={'steward': 'swarm-beacon-1782045381627-1'})
print(f"Steward 2 sign: {json.dumps(sign2, indent=2)}\n")

print(f"5. Try to sign again with same steward (should fail)...")
sign_dup = api_call(f'/api/forum/proposals/{topic_id}/sign', method='POST', data={'steward': 'swarm-atlas-1782045381627-0'})
print(f"Duplicate sign: {json.dumps(sign_dup, indent=2)}\n")

print(f"6. Try to execute (should still fail - proposal is active, not passed)...")
exec_result2 = api_call(f'/api/forum/proposals/{topic_id}/execute', method='POST', data={'agent': 'test-executor'})
print(f"Execute with signatures: {json.dumps(exec_result2, indent=2)}\n")

print(f"7. Check proposal status...")
proposals = api_call('/api/forum/proposals?limit=3')
for p in proposals.get('proposals', [])[:3]:
    if p['id'] == topic_id:
        print(f"Status: {p.get('proposalStatus')}")
        print(f"Steward signatures: {p.get('stewardSignatures', [])}")
        print(f"Quorum required: {p.get('stewardQuorumRequired')}")
