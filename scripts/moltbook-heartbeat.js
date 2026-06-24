#!/usr/bin/env node
/**
 * Moltbook heartbeat daemon.
 * Runs in foreground and pings Moltbook every 30 minutes to keep
 * the agent active. Designed to be run under pm2 or systemd on the
 * production server.
 *
 * Usage:
 *   node scripts/moltbook-heartbeat.js
 *
 * Environment:
 *   MOLTBOOK_HEARTBEAT_INTERVAL_MS  override interval (default 30 min)
 */
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import os from 'os';

const API_BASE = 'https://www.moltbook.com/api/v1';
const INTERVAL_MS = parseInt(process.env.MOLTBOOK_HEARTBEAT_INTERVAL_MS || '1800000', 10); // 30 min

function getApiKey() {
  const credsPath = path.join(os.homedir(), '.config', 'moltbook', 'credentials.json');
  if (!fs.existsSync(credsPath)) {
    console.error('✘ No credentials. Run: node scripts/moltbook-register.js first');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(credsPath, 'utf8')).api_key;
}

async function tick(apiKey) {
  const ts = new Date().toISOString();
  try {
    const resp = await axios.post(`${API_BASE}/agents/heartbeat`, {}, {
      headers: { Authorization: `Bearer ${apiKey}` },
      timeout: 15000
    });
    console.log(`[${ts}] ✔ heartbeat ok:`, JSON.stringify(resp.data).slice(0, 200));
  } catch (e) {
    console.error(`[${ts}] ✘ heartbeat failed:`, e.response?.data || e.message);
  }
}

const apiKey = getApiKey();
console.log(`[startup] Moltbook heartbeat daemon — interval ${INTERVAL_MS}ms`);
tick(apiKey);
setInterval(() => tick(apiKey), INTERVAL_MS);
