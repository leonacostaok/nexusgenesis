/**
 * Build script: bundles @noble/post-quantum ML-DSA + a self-contained ngPQC
 * browser API into a single self-hosted ESM file at public/vendor/ng-pqc.js.
 *
 * Rationale: index.html previously imported the PQC library from esm.sh CDN at
 * runtime, which is unreliable (fails with net::ERR_ABORTED in some regions).
 * Vendoring removes the third-party runtime dependency entirely.
 *
 * Run: node scripts/build-pqc.mjs
 */
import { build } from 'esbuild';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outFile = path.resolve(__dirname, '../public/vendor/ng-pqc.js');

// Thin wrapper that re-exports the minimal ML-DSA surface we need.
const entry = `
  import { ml_dsa44 } from '@noble/post-quantum/ml-dsa.js';
  export { ml_dsa44 };
`;

const options = {
  stdin: {
    contents: entry,
    resolveDir: path.resolve(__dirname, '..'),
    sourcefile: 'ng-pqc-entry.js',
    loader: 'js',
  },
  bundle: true,
  format: 'esm',
  target: ['es2020'],
  platform: 'browser',
  treeShaking: true,
  minify: true,
  legalComments: 'none',
  outfile: outFile,
  logLevel: 'info',
};

const result = await build(options);
const sizeKb = (await (await import('fs/promises')).stat(outFile)).size / 1024;
console.log('✅ Bundled ngPQC library ->', outFile);
console.log('   Output size:', `${sizeKb.toFixed(1)} KB`);
