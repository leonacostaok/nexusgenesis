#!/usr/bin/env python3
"""Call admin endow endpoint and print summary."""
import json, urllib.request

API = "http://127.0.0.1:19891"
SECRET = "devnet-endow-2026"

def main():
    body = json.dumps({"amount": 1000, "adminSecret": SECRET}).encode()
    req = urllib.request.Request(
        API + "/api/v1/admin/endow-existing-agents",
        data=body,
        headers={"Content-Type": "application/json", "x-admin-secret": SECRET},
        method="POST"
    )
    with urllib.request.urlopen(req) as r:
        d = json.load(r)
    print("success:", d.get("success"))
    print("endowed:", d.get("endowed"))
    print("skipped:", d.get("skipped"))
    print("failed:", d.get("failed"))
    print("target:", d.get("target"))
    results = d.get("results", [])
    print(f"results sample ({len(results)} shown):")
    for r in results[:5]:
        print(f"  {r.get('agentId','?')[:16]}... before={r.get('before')} topup={r.get('topup')} after={r.get('after')}")

if __name__ == "__main__":
    main()
