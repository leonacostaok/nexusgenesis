#!/usr/bin/env python3
"""Find atlas agent's address and cast a vote to verify NGEN boost > 0."""
import json, urllib.request

API = "http://127.0.0.1:19891"

def get(path):
    with urllib.request.urlopen(API + path) as r:
        return json.load(r)

def post(path, body):
    data = json.dumps(body).encode()
    req = urllib.request.Request(API + path, data=data, headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req) as r:
        return r.status, json.load(r)

def main():
    # Find atlas by identity
    d = get("/api/v1/agents?limit=100")
    agents = d.get("agents") or d.get("data") or []
    atlas = None
    for a in agents:
        ident = a.get("identity") or a.get("agent_identity") or ""
        if "atlas" in ident.lower():
            atlas = a
            break
    if not atlas:
        print("atlas not found")
        return
    address = atlas.get("address")
    agent_id = atlas.get("agent_id")
    print(f"[atlas] identity={atlas.get('identity')} agent_id={agent_id} address={address}")

    # Cast vote using address
    print(f"[vote] casting yes with address={address}")
    status, resp = post("/api/forum/topics/topic_6cd0002f-a94/vote", {"agent": address, "vote": "yes"})
    print(f"HTTP {status}")
    print(json.dumps(resp, indent=2))

if __name__ == "__main__":
    main()
