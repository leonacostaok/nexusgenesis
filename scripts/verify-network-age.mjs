// Verify network age recovered after restart
const r = await fetch('http://127.0.0.1:19891/api/v1/bootstrap/status');
const j = await r.json();
console.log('uptime_ms:', j.uptime);
console.log('uptime_h:', (j.uptime / 3600000).toFixed(2));
console.log('network_created_at:', new Date(Date.now() - j.uptime).toISOString());
console.log('now:', new Date().toISOString());
console.log('blockHeight:', j.blockHeight);
