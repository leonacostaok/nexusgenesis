import urllib.request
import json
import time

BASE = 'http://localhost:19891'

def api_call(endpoint, method='GET', data=None, headers=None):
    url = f'{BASE}{endpoint}'
    req = urllib.request.Request(url, method=method)
    req.add_header('Content-Type', 'application/json')
    if headers:
        for k, v in headers.items():
            req.add_header(k, v)
    if data:
        req.data = json.dumps(data).encode()
    try:
        resp = urllib.request.urlopen(req, timeout=10)
        return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        return {'error': str(e), 'body': e.read().decode()}
    except Exception as e:
        return {'error': str(e)}

print("=== Stage 4: Proposal Lifecycle Verification ===\n")

print("1. Create a [Proposal] topic...")
result = api_call('/api/forum/topics', method='POST', data={
    'title': '[Proposal] Test proposal lifecycle stage 4',
    'body': 'This proposal tests the draft→active→passed→executed lifecycle. Vote yes to verify quorum.',
    'author': 'test-lifecycle-agent',
    'authorType': 'agent',
    'tags': ['governance', 'proposal', 'test']
})
print(f"Create result: {json.dumps(result, indent=2)}\n")

if not result.get('success'):
    print("FAILED: Could not create proposal topic")
    exit(1)

topic_id = result['topic']['id']
print(f"Topic ID: {topic_id}")
print(f"Proposal Status: {result['topic'].get('proposalStatus', 'MISSING')}")
print(f"Proposal Deadline: {result['topic'].get('proposalDeadline', 'MISSING')}\n")

print("2. List proposals to verify status...")
proposals = api_call('/api/forum/proposals?limit=5')
if proposals.get('success'):
    for p in proposals.get('proposals', [])[:3]:
        print(f"  {p['id']} | status={p.get('proposalStatus', 'N/A')} | title={p['title'][:40]}")

print(f"\n3. Vote on proposal (yes)...")
vote1 = api_call(f'/api/forum/topics/{topic_id}/vote', method='POST', data={
    'agent': 'test-voter-1',
    'vote': 'yes'
})
print(f"Vote 1: {json.dumps(vote1, indent=2)}")

print(f"\n4. Vote again (different agent, yes)...")
vote2 = api_call(f'/api/forum/topics/{topic_id}/vote', method='POST', data={
    'agent': 'test-voter-2',
    'vote': 'yes'
})
print(f"Vote 2: {json.dumps(vote2, indent=2)}")

print(f"\n5. Vote again (third agent, yes - meets quorum)...")
vote3 = api_call(f'/api/forum/topics/{topic_id}/vote', method='POST', data={
    'agent': 'test-voter-3',
    'vote': 'yes'
})
print(f"Vote 3: {json.dumps(vote3, indent=2)}")

print(f"\n6. Try to execute (should fail - still active, deadline not passed)...")
exec_result = api_call(f'/api/forum/proposals/{topic_id}/execute', method='POST', data={
    'agent': 'test-executor'
})
print(f"Execute (should fail): {json.dumps(exec_result, indent=2)}")

print(f"\n7. Check votes tally...")
votes = api_call(f'/api/forum/topics/{topic_id}/votes')
print(f"Votes: {json.dumps(votes, indent=2)}")
