import crypto from 'crypto';
import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');

function generateValidatorKeyPair() {
  const keyPair = crypto.generateKeyPairSync('ed25519', {
    modulusLength: 256,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });

  const address = 'ngv' + crypto.createHash('sha3-256')
    .update(keyPair.publicKey)
    .digest('hex')
    .substring(0, 40);

  return { address, ...keyPair };
}

function onboardValidator(options) {
  const {
    name = 'Unnamed Validator',
    stake = 100000,
    identity = '',
    region = 'unknown',
    provider = 'self-hosted',
    hardware = '4 vCPU / 16GB RAM / 500GB NVMe'
  } = options;

  const keys = generateValidatorKeyPair();

  const validatorData = {
    name,
    publicKey: keys.publicKey,
    address: keys.address,
    stake,
    identity: identity || name.toLowerCase().replace(/\s+/g, '-'),
    createdAt: new Date().toISOString(),
    endpoint: `wss://${name.toLowerCase().replace(/\s+/g, '-')}.nexus-genesis.top:9848`,
    metadata: { region, provider, hardware }
  };

  const validatorsDir = resolve(PROJECT_ROOT, 'data', 'validators');
  if (!existsSync(validatorsDir)) mkdirSync(validatorsDir, { recursive: true });

  const fileName = validatorData.identity + '.json';
  writeFileSync(resolve(validatorsDir, fileName), JSON.stringify(validatorData, null, 2));

  writeFileSync(resolve(validatorsDir, `${validatorData.identity}_key.json`), JSON.stringify({
    publicKey: keys.publicKey,
    privateKey: keys.privateKey,
    address: keys.address,
    note: 'STORE SECURELY - This private key signs consensus votes'
  }, null, 2));

  return validatorData;
}

function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.log('NexusGenesis Validator Onboarding Tool');
    console.log('');
    console.log('Usage:');
    console.log('  node scripts/onboard-validator.js <name> [stake] [region]');
    console.log('');
    console.log('Examples:');
    console.log('  node scripts/onboard-validator.js "Alpha Validator" 100000 asia-east');
    console.log('  node scripts/onboard-validator.js "Beta Node" 150000 europe-west');
    process.exit(0);
  }

  const [name, stake = 100000, region = 'unknown'] = args;

  console.log('NexusGenesis Validator Onboarding');
  console.log('');
  console.log(`  Name:   ${name}`);
  console.log(`  Stake:  ${Number(stake).toLocaleString()} NGEN`);
  console.log(`  Region: ${region}`);
  console.log('');

  const validator = onboardValidator({
    name,
    stake: Number(stake),
    region,
    identity: name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
    endpoint: `wss://${name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}.nexus-genesis.top:9848`
  });

  console.log('Validator Onboarded!');
  console.log(`  Address:   ${validator.address}`);
  console.log(`  Endpoint:  ${validator.endpoint}`);
  console.log(`  Public Key: ${validator.publicKey.slice(0, 40)}...`);
  console.log('');
  console.log('Next steps:');
  console.log(`  1. Update config/validator-set.json with this public key`);
  console.log(`  2. Deploy server: ROLE=validator VALIDATOR_NAME="${validator.identity}" STAKE=${stake} bash scripts/provision-server.sh`);
  console.log(`  3. Start validator: SEED_NODES=wss://seed1.nexus-genesis.top:9847,wss://seed2.nexus-genesis.top:9847 node src/node/validatorNode.js`);
  console.log('');
  console.log('Files saved:');
  console.log(`  data/validators/${validator.identity}.json`);
  console.log(`  data/validators/${validator.identity}_key.json (SECURE THIS!)`);
}

main();
