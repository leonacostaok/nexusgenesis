import { execSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CERTS_DIR = resolve(__dirname, '..', 'certs');

function ensureDir(path) {
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
}

function generateSelfSignedCerts() {
  console.log('Generating self-signed TLS certificates...');
  ensureDir(CERTS_DIR);

  execSync('openssl genrsa -out ca-key.pem 4096', { cwd: CERTS_DIR });
  execSync('openssl req -new -x509 -days 3650 -key ca-key.pem -sha256 -out ca.pem ' +
    '-subj "/CN=NexusGenesis Development CA/O=NexusGenesis/C=IO"', { cwd: CERTS_DIR });

  execSync('openssl genrsa -out server-key.pem 4096', { cwd: CERTS_DIR });

  const domains = [
    'DNS:localhost',
    'DNS:nexus-genesis.top',
    'DNS:*.nexus-genesis.top',
    'DNS:seed1.nexus-genesis.top',
    'DNS:seed2.nexus-genesis.top',
    'DNS:seed3.nexus-genesis.top',
    'DNS:seed4.nexus-genesis.top'
  ];

  execSync(`openssl req -new -key server-key.pem -out server.csr -subj "/CN=nexus-genesis.top/O=NexusGenesis/C=IO" -addext "subjectAltName=${domains.join(',')}"`, { cwd: CERTS_DIR });

  execSync('openssl x509 -req -days 365 -in server.csr -CA ca.pem -CAkey ca-key.pem ' +
    '-CAcreateserial -out server-cert.pem -extfile <(printf "subjectAltName=' + domains.join(',') + '")', { cwd: CERTS_DIR, shell: '/bin/bash' });

  try {
    writeFileSync(resolve(CERTS_DIR, 'fullchain.pem'),
      readFileSync(resolve(CERTS_DIR, 'server-cert.pem')) +
      readFileSync(resolve(CERTS_DIR, 'ca.pem')));
    writeFileSync(resolve(CERTS_DIR, 'privkey.pem'),
      readFileSync(resolve(CERTS_DIR, 'server-key.pem')));
  } catch (e) {
    console.log('Using server-cert.pem and server-key.pem directly');
  }

  console.log('Self-signed certificates generated in ' + CERTS_DIR);
  console.log('  fullchain.pem (or server-cert.pem)');
  console.log('  privkey.pem (or server-key.pem)');
  console.log('  ca.pem');
}

function showProductionInstructions() {
  console.log('NexusGenesis Production TLS Setup');
  console.log('');
  console.log('Recommended: Let\'s Encrypt with Certbot');
  console.log('');
  console.log('For each seed server, run:');

  const domains = [
    'seed1.nexus-genesis.top',
    'seed2.nexus-genesis.top',
    'seed3.nexus-genesis.top',
    'seed4.nexus-genesis.top'
  ];

  domains.forEach((domain, i) => {
    console.log(`  # Server ${i + 1}:`);
    console.log(`  sudo certbot certonly --standalone -d ${domain} --email admin@nexus-genesis.top --agree-tos --non-interactive`);
    console.log(`  sudo cp /etc/letsencrypt/live/${domain}/fullchain.pem certs/`);
    console.log(`  sudo cp /etc/letsencrypt/live/${domain}/privkey.pem certs/`);
    console.log('');
  });

  console.log('Auto-renewal (add to crontab):');
  console.log('  0 3 * * * certbot renew --quiet --post-hook "cp /etc/letsencrypt/live/*/fullchain.pem certs/ && cp /etc/letsencrypt/live/*/privkey.pem certs/"');

  const renewScript = `#!/bin/bash
# NexusGenesis TLS Certificate Auto-Renewal
certbot renew --quiet
for domain in ${domains.join(' ')}; do
  if [ -f "/etc/letsencrypt/live/$domain/fullchain.pem" ]; then
    cp "/etc/letsencrypt/live/$domain/fullchain.pem" "certs/$domain-fullchain.pem"
    cp "/etc/letsencrypt/live/$domain/privkey.pem" "certs/$domain-privkey.pem"
  fi
done
echo "[$(date)] TLS certificates renewed" >> certs/renewal.log
`;

  writeFileSync(resolve(__dirname, '..', 'scripts', 'renew-certs.sh'), renewScript);
  console.log('');
  console.log('Renewal script created: scripts/renew-certs.sh');
}

const mode = process.argv[2] || 'dev';

if (mode === 'prod' || mode === 'production') {
  showProductionInstructions();
} else {
  generateSelfSignedCerts();
}
