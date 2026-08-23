/**
 * gen-mtls-certs.mjs — 生成开发用 mTLS 证书（纯 node:crypto，无需系统 openssl）
 *
 * 用途：P1.3 本地/测试开发证书。生成一个自签根 CA + 服务端证书 + 两个客户端证书
 *       （server/client1/client2），落盘到 certs/mtls/。
 *       产出的 server/client 证书由同一 CA 签发，供 TLS 1.3 mTLS 双向认证使用。
 *
 * 用法：
 *   node scripts/gen-mtls-certs.mjs            # 输出到 certs/mtls/
 *   node scripts/gen-mtls-certs.mjs [outDir]   # 自定义输出目录
 *
 * 安全提示：仅用于开发/测试；生产 mTLS 证书签发须对接 service identity / KMS（Sprint 7）。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { X509Certificate } from 'node:crypto';
import { createCa, issueLeaf, generateEd25519Keypair } from './lib/x509.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = process.argv[2] ? resolve(process.cwd(), process.argv[2]) : resolve(__dirname, '..', 'certs', 'mtls');

function ensureDir(p) { mkdirSync(p, { recursive: true }); }

/** 用 node:crypto 校验证书可解析、SAN 正确、且叶子可被 CA 信任。 */
function verify({ ca, server, client1, client2 }) {
  const parse = (pem) => {
    try { return new X509Certificate(pem); } catch (err) { throw new Error(`证书解析失败: ${err.message}`); }
  };
  const c = { ca: parse(ca.cert), server: parse(server.cert), client1: parse(client1.cert), client2: parse(client2.cert) };

  // 受信任 CA 链校验（node 原生：用签发者公钥 KeyObject 验签叶子）。
  const trust = (leaf, issuer) => leaf.verify(issuer.publicKey);
  const results = [
    ['CA 自签', trust(c.ca, c.ca)],
    ['server 由 CA 签发', trust(c.server, c.ca)],
    ['client1 由 CA 签发', trust(c.client1, c.ca)],
    ['client2 由 CA 签发', trust(c.client2, c.ca)],
    ['server SAN=localhost', c.server.subjectAltName.includes('localhost')],
    ['server SAN=127.0.0.1', c.server.subjectAltName.includes('127.0.0.1')],
    ['client1 CN', c.client1.subject.includes('one-client')],
  ];
  for (const [name, ok] of results) {
    if (!ok) throw new Error(`自检失败: ${name}`);
  }
  return results.map(([name]) => `  [ok] ${name}`);
}

function main() {
  ensureDir(OUT_DIR);

  const ca = createCa();
  const dnDefault = ['localhost'];
  const ipDefault = ['127.0.0.1', '::1'];

  const serverKey = generateEd25519Keypair();
  const server = issueLeaf({ ca, keypair: serverKey, cn: 'localhost', eku: ['serverAuth'], dns: dnDefault, ip: ipDefault });

  const clientKey1 = generateEd25519Keypair();
  const client1 = issueLeaf({ ca, keypair: clientKey1, cn: 'one-client', eku: ['clientAuth'], dns: dnDefault, ip: ipDefault });
  const clientKey2 = generateEd25519Keypair();
  const client2 = issueLeaf({ ca, keypair: clientKey2, cn: 'two-client', eku: ['clientAuth'], dns: dnDefault, ip: ipDefault });

  writeFileSync(resolve(OUT_DIR, 'ca.pem'), ca.cert);
  writeFileSync(resolve(OUT_DIR, 'ca-key.pem'), ca.keypair.privatePem);
  writeFileSync(resolve(OUT_DIR, 'server-cert.pem'), server.cert);
  writeFileSync(resolve(OUT_DIR, 'server-key.pem'), server.keypair.privatePem);
  writeFileSync(resolve(OUT_DIR, 'client1-cert.pem'), client1.cert);
  writeFileSync(resolve(OUT_DIR, 'client1-key.pem'), client1.keypair.privatePem);
  writeFileSync(resolve(OUT_DIR, 'client2-cert.pem'), client2.cert);
  writeFileSync(resolve(OUT_DIR, 'client2-key.pem'), client2.keypair.privatePem);

  console.log(`mTLS 证书生成到 ${OUT_DIR}:`);
  console.log('  ca.pem / ca-key.pem          根 CA（自签）');
  console.log('  server-cert.pem / server-key.pem   服务端（serverAuth, SAN=localhost/127.0.0.1/::1）');
  console.log('  client1-cert.pem / client1-key.pem  客户端1（clientAuth）');
  console.log('  client2-cert.pem / client2-key.pem  客户端2（clientAuth）');
  console.log('自检:');
  for (const line of verify({ ca, server, client1, client2 })) console.log(line);
  console.log('\n注意：本证书仅用于开发/测试，不要用于生产。');
}

main();