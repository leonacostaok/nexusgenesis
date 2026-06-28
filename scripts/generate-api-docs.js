import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

const SECTIONS = [
  {
    name: 'SDK',
    title: 'NexusGenesis JavaScript SDK',
    path: 'src/sdk/index.js',
    discovery: ['class NexusGenesisSDK', 'constructor', 'async (\\w+)\\(']
  },
  {
    name: 'PQCWallet',
    title: '抗量子钱包 (PQCWallet)',
    path: 'src/wallet/pqcWallet.js',
    discovery: ['class PQCWallet', 'async (\\w+)\\(', '(\\w+)\\s*\\(']
  },
  {
    name: 'AgentManager',
    title: '智能体管理 (AgentManager)',
    path: 'src/agent/agentManager.js',
    discovery: ['class AgentManager', 'async (\\w+)\\(', '(\\w+)\\s*\\(']
  },
  {
    name: 'ContractTemplateLibrary',
    title: '合约模板库',
    path: 'src/contracts/templates/contractTemplates.js',
    discovery: ['class ContractTemplateLibrary', 'async (\\w+)\\(', '(\\w+)\\s*\\(']
  },
  {
    name: 'CrossChainBridge',
    title: '跨链桥',
    path: 'src/bridge/crossChainBridge.js',
    discovery: ['class CrossChainBridge', 'async (\\w+)\\(', '(\\w+)\\s*\\(']
  },
  {
    name: 'DeveloperIncentives',
    title: '开发者激励系统',
    path: 'src/economy/developerIncentives.js',
    discovery: ['class DeveloperIncentives', 'async (\\w+)\\(', '(\\w+)\\s*\\(']
  }
];

const KEYWORDS = {
  red: ['async', 'await', 'new', 'return', 'throw', 'if', 'else', 'for', 'of', 'const', 'let', 'class', 'extends', 'import', 'export'],
  blue: ['console', 'JSON', 'Buffer', 'String', 'Number', 'BigInt', 'Map', 'Set', 'Array'],
  green: ['true', 'false', 'null', 'undefined', 'this'],
  purple: ['fs', 'path', 'crypto', 'fileURLToPath', 'url']
};

function generateClassDoc(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const className = extractClassName(lines);
  const methods = extractMethods(lines);
  const description = extractDescription(lines);
  
  return { className, description, methods };
}

function extractClassName(lines) {
  for (const line of lines) {
    const m = line.match(/class\s+(\w+)/);
    if (m) return m[1];
  }
  return 'Unknown';
}

function extractDescription(lines) {
  const comments = [];
  let inComment = false;
  for (const line of lines.slice(0, 30)) {
    if (line.trim().startsWith('/**')) { inComment = true; continue; }
    if (inComment) {
      if (line.trim() === '*/') break;
      const cleaned = line.replace(/^\s*\*\s*/, '').trim();
      if (cleaned && !cleaned.startsWith('@')) comments.push(cleaned);
    }
  }
  return comments.join(' ') || '（无描述）';
}

function extractMethods(lines) {
  const methods = [];
  let currentMethod = null;
  let braceDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (currentMethod) {
      braceDepth += (trimmed.match(/{/g) || []).length;
      braceDepth -= (trimmed.match(/}/g) || []).length;
      if (braceDepth <= 0) {
        currentMethod.endLine = i;
        methods.push(currentMethod);
        currentMethod = null;
      }
      continue;
    }

    const methodMatch = trimmed.match(/^(async\s+)?(\w+)\s*\(([^)]*)\)\s*\{/);
    if (methodMatch && !['if', 'for', 'while', 'switch', 'catch'].includes(methodMatch[2])) {
      if (methodMatch[2] === 'constructor') continue;
      const params = methodMatch[3].split(',').map(p => p.trim()).filter(p => p);
      currentMethod = {
        name: methodMatch[2],
        async: !!methodMatch[1],
        params,
        startLine: i,
        endLine: i
      };
      braceDepth = 1;
    }
  }
  return methods;
}

function generateMarkdown() {
  const output = [];
  const timestamp = new Date().toISOString().split('T')[0];

  output.push(`# NexusGenesis API 自动文档`);
  output.push(`> Auto-generated: ${timestamp} | Version: 1.0.0`);
  output.push('');
  output.push('---');
  output.push('');

  for (const section of SECTIONS) {
    const filePath = path.join(projectRoot, section.path);
    if (!fs.existsSync(filePath)) {
      console.log(`  ⚠ ${section.path} not found，跳过`);
      continue;
    }

    const doc = generateClassDoc(filePath);
    output.push(`## ${section.title}`);
    output.push('');
    output.push(`**类名:** \`${doc.className}\``);
    output.push('');
    output.push(`**描述:** ${doc.description}`);
    output.push('');
    
    if (doc.methods.length > 0) {
      output.push(`### 方法列表 (${doc.methods.length})`);
      output.push('');
      output.push('| 方法名 | 参数 | 异步 |');
      output.push('|--------|------|------|');
      for (const m of doc.methods) {
        const params = m.params.length > 0 ? m.params.map(p => `\`${p}\``).join(', ') : '—';
        output.push(`| \`${m.name}()\` | ${params} | ${m.async ? '✅' : '—'} |`);
      }
      output.push('');
    }

    output.push('---');
    output.push('');
    console.log(`  ✓ ${section.title} (${doc.methods.length} 方法)`);
  }

  output.push('## 快速开始');
  output.push('');
  output.push('```javascript');
  output.push("import SDK from 'nexusgenesis-sdk';");
  output.push('');
  output.push('const nexus = new SDK({');
  output.push("  apiKey: 'ng1_c29tcmFuZG9ta2V5Zm9yc2RrZXhhbXBsZQ',");
  output.push("  network: 'testnet'");
  output.push('});');
  output.push('');
  output.push('// 创建抗量子钱包');
  output.push('const wallet = await nexus.wallet.create();');
  output.push('');
  output.push('// 部署智能合约');
  output.push('const contract = await nexus.contracts.deploy({');
  output.push("  template: 'TOKEN',");
  output.push("  params: { name: 'MyToken', symbol: 'MTK', totalSupply: 1000000 }");
  output.push('});');
  output.push('');
  output.push('// 跨链转移');
  output.push('const transfer = await nexus.bridge.lock({');
  output.push("  fromChain: 'ethereum',");
  output.push("  toChain: 'nexusgenesis',");
  output.push("  amount: 100");
  output.push('});');
  output.push('```');
  output.push('');
  output.push('---');
  output.push(`*Auto-generated by API Doc Generator at ${new Date().toISOString()}*`);

  return output.join('\n');
}

const docsDir = path.join(projectRoot, 'docs');
if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir, { recursive: true });

const md = generateMarkdown();
const outputPath = path.join(docsDir, 'API.md');
fs.writeFileSync(outputPath, md, 'utf8');

console.log(`\n✅ API 文档已生成: docs/API.md`);
console.log(`   包含 ${SECTIONS.length} 个模块`);