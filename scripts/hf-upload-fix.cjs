#!/usr/bin/env node
const https = require('https');
const crypto = require('crypto');
const HF_TOKEN = process.env.HF_TOKEN;
if (!HF_TOKEN) { console.error('HF_TOKEN not set'); process.exit(1); }
function hfRequest(method, path, body, contentType = 'application/json') {
  return new Promise((resolve, reject) => {
    const data = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : null;
    const opts = { method, hostname: 'huggingface.co', path, headers: { 'Authorization': `Bearer ${HF_TOKEN}`, 'Content-Type': contentType }, timeout: 30000 };
    if (data) opts.headers['Content-Length'] = Buffer.byteLength(data);
    const req = https.request(opts, (res) => {
      let body = ''; res.on('data', (chunk) => body += chunk);
      res.on('end', () => { try { resolve({ status: res.statusCode, data: body ? JSON.parse(body) : {} }); } catch { resolve({ status: res.statusCode, data: body }); } });
    });
    req.on('error', reject); req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    if (data) req.write(data); req.end();
  });
}
async function getUser() { const res = await hfRequest('GET', '/api/whoami-v2'); if (res.status !== 200) throw new Error(`Auth failed: ${res.status}`); return res.data.name || res.data.fullname; }
async function commitFiles(repoId, repoType, summary, files) {
  const payload = { summary, files: files.map(f => ({ path: f.path, content: f.encoding === 'base64' ? Buffer.from(f.content).toString('base64') : f.content, encoding: f.encoding || 'utf-8' })) };
  console.log(`  Committing ${files.length} files to ${repoType}/${repoId}...`);
  const res = await hfRequest('POST', `/api/${repoType}s/${repoId}/commit/main`, payload);
  if (res.status >= 200 && res.status < 300) { console.log(`  [+] Commit successful`); return true; } else { console.log(`  [!] Commit failed: ${res.status}`); return false; }
}
module.exports = { hfRequest, getUser, commitFiles };
