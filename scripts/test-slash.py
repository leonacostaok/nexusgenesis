import json

# Create slash request JSON
payload = {
    "agent_identity": "swarm-atlas-1782045381627-0",
    "violation": "downtime"
}
with open("/tmp/slash.json", "w") as f:
    json.dump(payload, f)
print("slash.json written:", json.dumps(payload))
