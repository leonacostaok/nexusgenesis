#!/usr/bin/env python3
"""Register a test agent and verify it receives 1000 NGEN on-chain."""
import json, time, urllib.request

API = "http://127.0.0.1:19891"

def post(path, body):
    data = json.dumps(body).encode()
    req = urllib.request.Request(API + path, data=data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req) as r:
        return r.status, json.load(r)

def get(path):
    with urllib.request.urlopen(API + path) as r:
        return json.load(r)

def main():
    ident = f"test-endow-{int(time.time())}"
    print(f"[1] Registering agent: {ident}")
    status, resp = post("/api/v1/agents/register", {
        "agent_identity": ident,
        "capabilities": ["testing"]
    })
    print(f"    HTTP {status}")
    if not resp.get("success"):
        print(f"    FAILED: {resp}")
        return
    address = resp.get("address") or resp.get("wallet", {}).get("address")
    agent_id = resp.get("agent_id") or resp.get("agentId")
    print(f"    agent_id={agent_id}")
    print(f"    address={address}")

    # Give the chain a moment to include the registration tx
    time.sleep(3)

    # Try multiple balance endpoints
    print(f"[2] Querying on-chain balance for {address}")
    for path in [
        f"/api/v1/wallet/balance/{address}",
        f"/api/v1/agents/{agent_id}/balance",
        f"/api/v1/agents/{agent_id}",
    ]:
        try:
            d = get(path)
            print(f"    {path}: {json.dumps(d)[:200]}")
        except Exception as e:
            print(f"    {path}: ERROR {e}")

    # Direct state query via debug endpoint if available
    print(f"[3] Querying agent record via /api/v1/agents?limit=50")
    try:
        d = get("/api/v1/agents?limit=50")
        agents = d.get("agents") or d.get("data") or []
        for a in agents:
            if a.get("agent_id") == agent_id or a.get("address") == address:
                print(f"    FOUND: {json.dumps(a)[:300]}")
                break
        else:
            print(f"    agent not found in list ({len(agents)} agents)")
    except Exception as e:
        print(f"    ERROR: {e}")

if __name__ == "__main__":
    main()
