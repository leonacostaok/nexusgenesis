import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  fs.readdirSync(dir).forEach(f => {
    const fp = path.join(dir, f);
    if (fs.statSync(fp).isDirectory()) {
      const skip = ['node_modules', '.git', 'data', 'logs', 'testnet', 'subagents', 'public', 'keystore'];
      if (!skip.includes(f)) walk(fp, files);
    } else if (f.endsWith('.js')) {
      files.push(fp);
    }
  });
  return files;
}

const dirs = ['src', 'test', 'scripts'];
let files = [];
dirs.forEach(d => files = files.concat(walk(path.join(ROOT, d))));

console.log(`Checking ${files.length} JS files for syntax errors...\n`);

let errors = 0;
const errorFiles = [];

files.forEach(f => {
  try {
    execSync(`node --check "${f}"`, { stdio: 'pipe', timeout: 5000, cwd: ROOT });
  } catch (e) {
    errors++;
    const rel = path.relative(ROOT, f);
    errorFiles.push(rel);
    console.log(`  ERR: ${rel}`);
  }
});

console.log(`\n===== Result =====`);
console.log(`Checked: ${files.length} files`);
console.log(`Errors: ${errors}`);
if (errors > 0) {
  console.log(`\nError files:`);
  errorFiles.forEach(f => console.log(`  ${f}`));
}