import crypto from 'crypto';

export const ADDRESS_VERSION = 0x00;
export const ADDRESS_PREFIX = 'ng1';
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export function base58Encode(buffer) {
  if (buffer.length === 0) return '';
  let zeros = 0;
  while (zeros < buffer.length && buffer[zeros] === 0) zeros++;
  let num = BigInt('0x' + buffer.toString('hex'));
  let encoded = '';
  while (num > 0n) {
    const remainder = num % 58n;
    num = num / 58n;
    encoded = BASE58_ALPHABET[Number(remainder)] + encoded;
  }
  return '1'.repeat(zeros) + encoded;
}

export function generateAddress(publicKey) {
  const digest = crypto.createHash('sha3-256').update(publicKey).digest();
  const versionedPayload = Buffer.concat([Buffer.from([ADDRESS_VERSION]), digest]);
  const checksum = crypto.createHash('sha3-256').update(versionedPayload).digest().slice(0, 4);
  return ADDRESS_PREFIX + base58Encode(Buffer.concat([versionedPayload, checksum]));
}

export function validateAddressFormat(address) {
  if (!address || typeof address !== 'string' || !address.startsWith(ADDRESS_PREFIX)) {
    return false;
  }
  return true;
}

export function generateWalletKeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const jwk = publicKey.export({ format: 'jwk' });
  const privJwk = privateKey.export({ format: 'jwk' });
  const pubHex = Buffer.from(jwk.x, 'base64url').toString('hex');
  const privHex = Buffer.from(privJwk.d, 'base64url').toString('hex');
  return {
    publicKeyHex: pubHex,
    privateKeyHex: privHex,
    address: generateAddress(Buffer.from(pubHex, 'hex'))
  };
}

export function signMessage(privateKeyHex, publicKeyHex, message) {
  const privJwk = {
    kty: 'OKP',
    crv: 'Ed25519',
    d: Buffer.from(privateKeyHex, 'hex').toString('base64url'),
    x: Buffer.from(publicKeyHex, 'hex').toString('base64url')
  };
  const privKey = crypto.createPrivateKey({ key: privJwk, format: 'jwk' });
  const msgBuf = Buffer.from(typeof message === 'string' ? message : JSON.stringify(message));
  return crypto.sign(null, msgBuf, privKey).toString('hex');
}

export function verifySignature(publicKeyHex, message, signatureHex) {
  try {
    const pubJwk = {
      kty: 'OKP',
      crv: 'Ed25519',
      x: Buffer.from(publicKeyHex, 'hex').toString('base64url')
    };
    const pubKey = crypto.createPublicKey({ key: pubJwk, format: 'jwk' });
    const msgBuf = Buffer.from(typeof message === 'string' ? message : JSON.stringify(message));
    return crypto.verify(null, msgBuf, pubKey, Buffer.from(signatureHex, 'hex'));
  } catch {
    return false;
  }
}