/**
 * NexusGenesis TLS Certificate Generator
 * 
 * 生成自签名证书用于本地开发，并提供 Let's Encrypt 生产证书说明
 * 
 * 用法:
 *   node scripts/generate-certs.js          → 生成自签名证书 (开发)
 *   node scripts/generate-certs.js --prod   → 生成 Let's Encrypt 说明
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');
const CERTS_DIR = resolve(PROJECT_ROOT, 'certs');

const args = process.argv.slice(2);
const isProd = args.includes('--prod');

function ensureDir(dir) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function generateSelfSignedCerts() {
  console.log('🔐 Generating self-signed TLS certificates for local development...\n');
  ensureDir(CERTS_DIR);

  const keyFile = resolve(CERTS_DIR, 'privkey.pem');
  const certFile = resolve(CERTS_DIR, 'fullchain.pem');
  const caFile = resolve(CERTS_DIR, 'ca.pem');

  // Generate CA key and cert
  console.log('[1/4] Generating CA private key...');
  execSync(
    'openssl genrsa -out ca-key.pem 4096',
    { cwd: CERTS_DIR, stdio: 'pipe' }
  );

  console.log('[2/4] Generating self-signed CA certificate...');
  execSync(
    'openssl req -new -x509 -days 3650 -key ca-key.pem -sha256 -out ca.pem ' +
    '-subj "/CN=NexusGenesis Development CA/O=NexusGenesis/C=IO"',
    { cwd: CERTS_DIR, stdio: 'pipe' }
  );

  // Generate server key
  console.log('[3/4] Generating server private key...');
  execSync(
    'openssl genrsa -out privkey.pem 2048',
    { cwd: CERTS_DIR, stdio: 'pipe' }
  );

  // Generate CSR and sign with CA
  console.log('[4/4] Signing server certificate...');
  execSync(
    'openssl req -new -key privkey.pem -out server.csr ' +
    '-subj "/CN=localhost/O=NexusGenesis Dev/C=IO"',
    { cwd: CERTS_DIR, stdio: 'pipe' }
  );

  // Create extensions file for SAN
  const extPath = resolve(CERTS_DIR, 'extfile.cnf');
  writeFileSync(extPath,
    'subjectAltName=DNS:localhost,DNS:seed1.nexusgenesis.io,DNS:seed2.nexusgenesis.io,DNS:seed3.nexusgenesis.io,DNS:seed4.nexusgenesis.io,IP:127.0.0.1\n' +
    'extendedKeyUsage=serverAuth,clientAuth\n'
  );

  execSync(
    'openssl x509 -req -in server.csr -CA ca.pem -CAkey ca-key.pem ' +
    '-CAcreateserial -out fullchain.pem -days 365 -sha256 -extfile extfile.cnf',
    { cwd: CERTS_DIR, stdio: 'pipe' }
  );

  // Cleanup
  try { execSync('rm -f server.csr extfile.cnf', { cwd: CERTS_DIR, stdio: 'pipe' }); } catch(e) {}

  // Verify
  const certContent = readFileSync(certFile, 'utf8');
  const keyContent = readFileSync(keyFile, 'utf8');
  const caContent = readFileSync(caFile, 'utf8');

  console.log('\n✅ Self-signed certificates generated successfully!\n');
  console.log(`   CA Certificate:     ${caFile} (${caContent.length} bytes)`);
  console.log(`   Server Certificate: ${certFile} (${certContent.length} bytes)`);
  console.log(`   Private Key:        ${keyFile} (${keyContent.length} bytes)`);
  console.log('\n⚠️  Self-signed certs are for DEVELOPMENT ONLY.');
  console.log('   Browsers and external agents will show security warnings.');
  console.log('   Use --prod for production certificate setup.\n');
}

function showProductionInstructions() {
  console.log('🔐 NexusGenesis Production TLS Certificate Setup\n');
  console.log('═══════════════════════════════════════════════\n');
  console.log('Recommended: Let\'s Encrypt with Certbot\n');
  console.log('Prerequisites:');
  console.log('  - Domain names pointing to your servers');
  console.log('  - Port 80 open for HTTP-01 challenge');
  console.log('  - certbot installed on server\n');

  const domains = [
    'seed1.nexusgenesis.io',
    'seed2.nexusgenesis.io',
    'seed3.nexusgenesis.io',
    'seed4.nexusgenesis.io'
  ];

  console.log('For each seed server, run:\n');

  domains.forEach((domain, i) => {
    console.log(`  # Server ${i + 1}: ${domain}`);
    console.log(`  sudo certbot certonly --standalone \\`);
    console.log(`    -d ${domain} \\`);
    console.log(`    --email admin@nexusgenesis.io \\`);
    console.log(`    --agree-tos --non-interactive\n`);
  });

  console.log('After obtaining certs, copy them to certs/ directory:\n');
  console.log('  mkdir -p certs/');
  console.log('  sudo cp /etc/letsencrypt/live/seed1.nexusgenesis.io/fullchain.pem certs/fullchain.pem');
  console.log('  sudo cp /etc/letsencrypt/live/seed1.nexusgenesis.io/privkey.pem   certs/privkey.pem');
  console.log('  sudo cp /etc/letsencrypt/live/seed1.nexusgenesis.io/chain.pem     certs/ca.pem');
  console.log('  sudo chown $(whoami):$(whoami) certs/*.pem\n');

  // Generate renewal script
  const renewScript = `#!/bin/bash
# NexusGenesis TLS Certificate Renewal Script
# Add to crontab: 0 3 * * * /app/scripts/renew-certs.sh >> /var/log/nexusgenesis-certs.log 2>&1

echo "[$(date)] Starting TLS certificate renewal..."

for DOMAIN in seed1.nexusgenesis.io seed2.nexusgenesis.io seed3.nexusgenesis.io seed4.nexusgenesis.io; do
  echo "[$(date)] Checking $DOMAIN..."
  if openssl x509 -checkend 2592000 -noout -in /app/certs/fullchain.pem 2>/dev/null; then
    echo "[$(date)] Certificate for $DOMAIN is valid for 30+ days, skipping"
  else
    echo "[$(date)] Renewing certificate for $DOMAIN..."
    certbot renew --quiet --cert-name $DOMAIN --deploy-hook "cp /etc/letsencrypt/live/$DOMAIN/fullchain.pem /app/certs/fullchain.pem && cp /etc/letsencrypt/live/$DOMAIN/privkey.pem /app/certs/privkey.pem && cp /etc/letsencrypt/live/$DOMAIN/chain.pem /app/certs/ca.pem && docker-compose -f /app/docker-compose.prod.yml restart genesis"
    echo "[$(date)] Renewal complete for $DOMAIN"
  fi
done

echo "[$(date)] TLS certificate renewal check complete."`;

  writeFileSync(resolve(PROJECT_ROOT, 'scripts', 'renew-certs.sh'), renewScript);
  try { execSync('chmod +x scripts/renew-certs.sh', { cwd: PROJECT_ROOT, stdio: 'pipe' }); } catch(e) {}

  console.log('✅ Renewal script created: scripts/renew-certs.sh');
  console.log('   Add to crontab for automatic renewal:\n');
  console.log('   crontab -e');
  console.log('   0 3 * * * /app/scripts/renew-certs.sh\n');
}

// Main
if (isProd) {
  showProductionInstructions();
} else {
  try {
    generateSelfSignedCerts();
  } catch (err) {
    console.error('❌ Certificate generation failed:', err.message);
    console.error('\nMake sure OpenSSL is installed:');
    console.error('  Windows: winget install OpenSSL.OpenSSL');
    console.error('  Linux:   sudo apt install openssl');
    console.error('  Mac:     brew install openssl\n');

    showProductionInstructions();
  }
}