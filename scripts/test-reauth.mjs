// Test re-auth endpoint directly on the server
const body = JSON.stringify({
  agent_identity: 'swarm-cipher-1782045383230-2',
  capabilities: ['security', 'code_review', 'crypto']
});

const r = await fetch('http://127.0.0.1:19891/api/v1/bootstrap/agents/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body
});
const text = await r.text();
console.log(`Status: ${r.status}`);
console.log(`Response: ${text}`);
