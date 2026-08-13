#!/usr/bin/env node
/**
 * Fix bootstrapApi.js production bug
 * Replace agentIdentity -> agent_identity on lines 660, 663, 696
 */

import { readFileSync, writeFileSync } from 'fs';

const filePath = '/opt/nexusgenesis/src/http/routes/bootstrapApi.js';

let content = readFileSync(filePath, 'utf8');

// Count occurrences before fix
const beforeCount = (content.match(/\bagentIdentity\b/g) || []).length;
console.log(`Found ${beforeCount} occurrences of 'agentIdentity' before fix`);

// Replace agentIdentity with agent_identity in the registration handler context
// Only replace the specific lines that are bugs (not the validator code which uses agentIdentity correctly)
content = content.replace(
  /console\.log\(`\[bootstrap\] Relay pre-signed transaction for \${agentIdentity}`\);/,
  'console.log(`[bootstrap] Relay pre-signed transaction for ${agent_identity}`);'
);

content = content.replace(
  /return handleBindMasterKeyRelay\(req, res, signedTx, agentIdentity, clientIp, node\);/,
  'return handleBindMasterKeyRelay(req, res, signedTx, agent_identity, clientIp, node);'
);

content = content.replace(
  /return sendRegistrationResponse\(res, node, agentIdentity, result,/
,
  'return sendRegistrationResponse(res, node, agent_identity, result,'
);

const afterCount = (content.match(/\bagentIdentity\b/g) || []).length;
console.log(`Found ${afterCount} occurrences of 'agentIdentity' after fix`);

writeFileSync(filePath, content, 'utf8');
console.log('Fix applied successfully!');
console.log('Restart PM2 with: pm2 restart nexusgenesis-genesis');
