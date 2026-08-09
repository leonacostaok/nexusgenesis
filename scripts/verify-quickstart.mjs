// Verify the 5-line quickstart works against the local package
import { generateKeyPair, sign, verify } from '../packages/agent-keys/src/index.js';

const { publicKey, privateKey } = await generateKeyPair();
const sig = await sign('hello nexusgenesis', privateKey);
const ok = await verify('hello nexusgenesis', sig, publicKey);
console.log('publicKey hex (first 16):', publicKey.toString('hex').slice(0, 16));
console.log('signature length:', sig.length);
console.log('verify ok:', ok);
if (!ok) { console.error('FAIL'); process.exit(1); }
console.log('QUICKSTART OK');
