#!/usr/bin/env python3
"""Check chain alignment across all 3 nodes."""
import json

nodes = {
    'Genesis': 'data/genesis/blockchain/blocks.json',
    'Node02': 'data/node02/blockchain/blocks.json',
    'Node03': 'data/node03/blockchain/blocks.json',
}

chains = {}
for name, path in nodes.items():
    try:
        with open(path) as f:
            chains[name] = json.load(f)
        print(f"{name}: height={len(chains[name])}, last_hash={chains[name][-1]['hash'][:32]}...")
    except Exception as e:
        print(f"{name}: ERROR - {e}")
        chains[name] = []

# Check alignment
g = chains.get('Genesis', [])
n2 = chains.get('Node02', [])
n3 = chains.get('Node03', [])

if g and n2:
    min_len = min(len(g), len(n2))
    mismatches = [i for i in range(min_len) if g[i]['hash'] != n2[i]['hash']]
    if not mismatches:
        print(f"\nNode02: ALIGNED (first {min_len} blocks match genesis)")
    else:
        print(f"\nNode02: MISALIGNED at blocks {mismatches[:5]}...")

if g and n3:
    min_len = min(len(g), len(n3))
    mismatches = [i for i in range(min_len) if g[i]['hash'] != n3[i]['hash']]
    if not mismatches:
        print(f"Node03: ALIGNED (first {min_len} blocks match genesis)")
    else:
        print(f"Node03: MISALIGNED at blocks {mismatches[:5]}...")
