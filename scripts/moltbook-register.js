#!/usr/bin/env node
/**
 * Moltbook agent registration helper.
 *
 * Registers a new agent on Moltbook and saves credentials to
 * ~/.config/moltbook/credentials.json so the poster script can reuse it.
 *
 * IMPORTANT: This is the FIRST script you run. The human must claim the
 * agent via the returned claim_url (tweet verification) before posting
 * becomes possible.
 *
 * Usage:
 *   node scripts/moltbook-register.js --name "NexusGenesisBot" --description "Agent-native blockchain"
 */
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import os from 'os';

const API_BASE = 'https://www.moltbook.com/api/v1';

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--name') opts.name = args[++i];
    else if (args[i] === '--description') opts.description = args[++i];
    else if (args[i] === '--help' || args[i] === '-h') {
      console.log('Usage: node scripts/moltbook-register.js --name "YourAgent" --description "What you do"');
      process.exit(0);
    }
  }
  return opts;
}

function getCredsPath() {
  const dir = path.join(os.homedir(), '.config', 'moltbook');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'credentials.json');
}

async function main() {
  const opts = parseArgs();
  if (!opts.name) {
    console.error('✘ --name is required');
    process.exit(1);
  }
  const description = opts.description || `Agent account for ${opts.name} on NexusGenesis — agent-native blockchain where completing tasks = NGEN tokens.`;

  console.log(`\n→ Registering Moltbook agent: "${opts.name}"`);
  console.log(`  description: ${description}\n`);

  try {
    const resp = await axios.post(`${API_BASE}/agents/register`, {
      name: opts.name,
      bio: description
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000
    });

    const data = resp.data || {};
    // API may return agent at top-level or nested
    const agent = data.agent || data;
    const apiKey = agent.api_key || data.api_key;
    const claimUrl = agent.claim_url || data.claim_url;
    const code = agent.verification_code || data.verification_code;

    if (!apiKey) {
      console.error('✘ No api_key in response:', JSON.stringify(data, null, 2));
      process.exit(1);
    }

    const creds = {
      api_key: apiKey,
      agent_name: opts.name,
      claim_url: claimUrl,
      verification_code: code,
      registered_at: new Date().toISOString(),
      claimed: false
    };

    const credsPath = getCredsPath();
    fs.writeFileSync(credsPath, JSON.stringify(creds, null, 2), { mode: 0o600 });
    console.log(`✔ Saved credentials to ${credsPath}\n`);

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  AGENT REGISTERED. NEXT STEPS:');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`  Agent name:     ${opts.name}`);
    console.log(`  Verification:   ${code}`);
    console.log(`  Claim URL:      ${claimUrl}`);
    console.log('');
    console.log('  → Open the claim URL in your browser');
    console.log('  → Verify your email (so you can log in later)');
    console.log('  → Post the verification tweet (X/Twitter)');
    console.log('  → Wait for status to flip to "claimed"');
    console.log('');
    console.log('  Check status with:');
    console.log(`    curl https://www.moltbook.com/api/v1/agents/status \\`);
    console.log(`      -H "Authorization: Bearer ${apiKey}"`);
    console.log('═══════════════════════════════════════════════════════════════\n');
  } catch (e) {
    const errBody = e.response?.data || e.message;
    console.error('✘ Registration failed:', JSON.stringify(errBody, null, 2));
    process.exit(1);
  }
}

main();
