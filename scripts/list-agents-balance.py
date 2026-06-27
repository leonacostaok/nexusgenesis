#!/usr/bin/env python3
"""List agents and their on-chain balances."""
import json, sys, urllib.request

API = "http://127.0.0.1:19891"

def fetch(path):
    with urllib.request.urlopen(API + path) as r:
        return json.load(r)

def main():
    d = fetch("/api/v1/agents?limit=50")
    agents = d.get("agents") or d.get("data") or []
    print(f"Found {len(agents)} agents")
    for a in agents:
        aid = a.get("agent_id") or a.get("id") or "?"
        addr = a.get("address") or a.get("wallet_address") or "?"
        bal = a.get("balance") or a.get("onchain_balance") or a.get("on_chain_balance") or "?"
        print(f"  {aid}  addr={addr[:24]}...  bal={bal}")

if __name__ == "__main__":
    main()
