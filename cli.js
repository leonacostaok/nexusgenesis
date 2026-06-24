#!/usr/bin/env node

/**
 * NexusGenesis CLI v2.0
 * 本地开发 + bootstrap API 调试工具
 *
 * Contract:  deploy | execute | list | info | gas | optimize | abi | test | templates | init
 * 钱包:  wallet create | wallet import | wallet export | wallet balance | wallet sign | wallet verify
 * Test网: testnet start | testnet status | testnet config
 * Governance(本地模拟):  governance propose | governance vote | governance list | governance execute
 * Bridge(API):  bridge lock | bridge status | bridge chains
 * 水龙头: faucet
 * 健康:  health | metrics
 */

import fs from 'fs/promises';
import path from 'path';
import { program } from 'commander';
import sdk, { NexusGenesisSDK } from './src/sdk/index.js';
import { WeightedVotingSystem } from './src/governance/weightedVoting.js';
import { ContributionSystem } from './src/ai/contributionSystem.js';
import { developerIncentives } from './src/economy/developerIncentives.js';

import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const VERSION = '2.0.0';

function printUnsupportedFeature(feature, details = '') {
  console.error(`✘ ${feature} 当前未通过公网 bootstrap API 公开`);
  if (details) {
    console.error(`  ${details}`);
  }
}

program.version(VERSION).description('NexusGenesis 本地开发 + bootstrap API 调试工具 v2.0');

// ======================== Contract命令（已有） ========================

program.command('deploy <file>')
  .description('DeploySmart Contract')
  .option('-n, --name <name>', 'Contract名称')
  .action(async (file, options) => {
    try {
      const code = await fs.readFile(file, 'utf8');
      const contractId = sdk.deployContract(code, options.name || path.basename(file, '.js'));
      console.log(`✔ ContractDeploysuccess! ID: ${contractId}`);
    } catch (e) { console.error(`✘ Deployfailed: ${e.message}`); }
  });

program.command('execute <contractId>')
  .description('ExecuteSmart Contract')
  .option('-g, --gas <gas>', 'Gas 限制', '10000')
  .action((contractId, options) => {
    try {
      const result = sdk.executeContract(contractId, parseInt(options.gas));
      console.log('Execute结果:', JSON.stringify(result, null, 2));
    } catch (e) { console.error(`✘ Executefailed: ${e.message}`); }
  });

program.command('list')
  .description('列出所有Contract')
  .action(() => {
    try {
      const contracts = sdk.listContracts();
      if (contracts.length === 0) { console.log('暂无deployedContract'); return; }
      console.log('\ndeployedContract:');
      contracts.forEach(c => console.log(`  ${c.id}  ${c.name}`));
    } catch (e) { console.error(`✘ ${e.message}`); }
  });

program.command('info <contractId>')
  .description('查看Contract详情')
  .action((contractId) => {
    try {
      const info = sdk.getContractInfo(contractId);
      console.log('Contract详情:', JSON.stringify(info, null, 2));
    } catch (e) { console.error(`✘ ${e.message}`); }
  });

program.command('templates')
  .description('列出Contract模板')
  .action(async () => {
    try {
      const templates = await sdk.listTemplates();
      console.log('\n可用模板:');
      templates.forEach(t => console.log(`  ${t.name}`));
    } catch (e) { console.error(`✘ ${e.message}`); }
  });

program.command('init <template> <output>')
  .description('从模板GenerateContract代码')
  .action(async (template, output) => {
    try {
      const code = await sdk.getTemplate(template);
      await sdk.saveContract(code, output);
      console.log(`✔ Contract已在 ${output} Generate`);
    } catch (e) { console.error(`✘ ${e.message}`); }
  });

program.command('gas <contractId>')
  .description('估算Contract Gas')
  .action((contractId) => {
    try {
      console.log(`预估 Gas: ${sdk.estimateGas(contractId)}`);
    } catch (e) { console.error(`✘ ${e.message}`); }
  });

program.command('optimize <file> <output>')
  .description('优化Contract代码')
  .action(async (file, output) => {
    try {
      const code = await sdk.loadContract(file);
      const opt = sdk.optimizeContractCode(code);
      await sdk.saveContract(opt, output);
      console.log(`✔ 已优化并Save到 ${output}`);
    } catch (e) { console.error(`✘ ${e.message}`); }
  });

program.command('abi <contractId>')
  .description('GenerateContract ABI')
  .action((contractId) => {
    try {
      console.log('Contract ABI:', JSON.stringify(sdk.generateABI(contractId), null, 2));
    } catch (e) { console.error(`✘ ${e.message}`); }
  });

program.command('test <contractId>')
  .description('TestContract')
  .action((contractId) => {
    try {
      const result = sdk.testContract(contractId, ['Test 1', 'Test 2', 'Test 3']);
      console.log(`Test结果: ${result.passed}/${result.total} 通过`);
      result.tests.forEach(t => {
        console.log(`  ${t.success ? '✔' : '✘'} ${t.test}`);
      });
    } catch (e) { console.error(`✘ ${e.message}`); }
  });

// ======================== 钱包命令（新增） ========================

const walletCmd = program.command('wallet').description('PQC post-quantum钱包管理');

walletCmd.command('create')
  .description('Create新钱包')
  .option('-b, --balance <amount>', '初始balance (NGEN)', '0')
  .option('-p, --password <pwd>', '加密密码')
  .action(async (options) => {
    try {
      const balance = BigInt(options.balance);
      const wallet = await sdk.createWallet(balance);
      console.log('\n✔ 钱包Createsuccess!');
      console.log(`  address:      ${wallet.address}`);
      console.log(`  public key:      ${wallet.publicKey}`);

      if (options.password) {
        const encrypted = sdk.exportWallet(options.password);
        const walletFile = path.join(process.cwd(), 'nexusgenesis-wallet.json');
        await fs.writeFile(walletFile, JSON.stringify({ address: wallet.address, encrypted }, null, 2));
        console.log(`  加密钱包saved到: ${walletFile}`);
      } else {
        console.log('  (未Set密码，钱包仅存在于Memory中)');
      }
    } catch (e) { console.error(`✘ ${e.message}`); }
  });

walletCmd.command('import <file>')
  .description('Import加密钱包')
  .option('-p, --password <pwd>', '解密密码')
  .action(async (file, options) => {
    try {
      if (!options.password) { console.error('✘ requires --password parameter'); return; }
      const data = JSON.parse(await fs.readFile(file, 'utf8'));
      const wallet = await sdk.importWallet(data.encrypted || data, options.password);
      console.log(`✔ 钱包已Import! address: ${wallet.address}`);
    } catch (e) { console.error(`✘ Importfailed: ${e.message}`); }
  });

walletCmd.command('export')
  .description('Export加密钱包')
  .option('-o, --output <file>', '输出文件', 'nexusgenesis-wallet.json')
  .option('-p, --password <pwd>', '加密密码')
  .action(async (options) => {
    try {
      if (!options.password) { console.error('✘ requires --password parameter'); return; }
      const encrypted = sdk.exportWallet(options.password);
      const addr = sdk.getWalletAddress();
      await fs.writeFile(options.output, JSON.stringify({ address: addr, encrypted }, null, 2));
      console.log(`✔ 加密钱包已Export到 ${options.output}`);
    } catch (e) { console.error(`✘ ${e.message}`); }
  });

walletCmd.command('balance')
  .description('查看钱包balance')
  .action(async () => {
    try {
      const addr = sdk.getWalletAddress();
      if (!addr) { console.log('✘ 未Load钱包，请先 create 或 import'); return; }
      console.log(`  address:   ${addr}`);
      console.log(`  balance:   查询中... (需Connectnode)`);
    } catch (e) { console.error(`✘ ${e.message}`); }
  });

walletCmd.command('sign <message>')
  .description('用钱包Signmessage')
  .action(async (message) => {
    try {
      const sig = await sdk.signMessage(message);
      console.log('Sign (hex):', typeof sig === 'string' ? sig : Buffer.from(sig).toString('hex'));
    } catch (e) { console.error(`✘ ${e.message}`); }
  });

walletCmd.command('verify <message> <signature> <publicKey>')
  .description('VerifymessageSign')
  .action(async (message, signature, publicKey) => {
    try {
      const valid = await NexusGenesisSDK.verifySignature(message, signature, publicKey);
      console.log(valid ? '✔ Sign有效' : '✘ Sign无效');
    } catch (e) { console.error(`✘ ${e.message}`); }
  });

// ======================== Test网命令（新增） ========================

const testnetCmd = program.command('testnet').description('Test网管理');

testnetCmd.command('start')
  .description('Start本地Test网')
  .action(async () => {
    try {
      console.log('Start NexusGenesis Test网...');
      const { spawn } = await import('child_process');
      const child = spawn('node', ['src/index.js'], { stdio: 'inherit', cwd: __dirname });
      console.log(`Test网started (PID: ${child.pid})`);
      child.on('exit', (code) => console.log(`Test网已Stop (exit code: ${code})`));
    } catch (e) { console.error(`✘ Startfailed: ${e.message}`); }
  });

testnetCmd.command('status')
  .description('查看Test网status')
  .action(async () => {
    try {
      const health = await sdk.checkHealth();
      const isOnline = health?.success !== false;
      console.log('\nTest网status:');
      console.log(`  status:   ${isOnline ? '在线' : '离线'}`);
      console.log(`  node:   ${health.nodeId || '未知'}`);
      console.log(`  高度:   ${health.blockHeight || '未知'}`);

      const metrics = await sdk.getMetrics();
      if (metrics.success !== false) {
        console.log(`\n性能指标:`);
        console.log(`  TPS:      ${metrics.tps || 'N/A'}`);
        console.log(`  Memory:     ${metrics.memoryUsage || 'N/A'}`);
        console.log(`  Peers:    ${metrics.peerCount || 'N/A'}`);
      }
    } catch (e) {
      console.log('  status: 离线');
      console.log(`  error: ${e.message}`);
    }
  });

testnetCmd.command('config')
  .description('查看Test网Configuration')
  .action(async () => {
    try {
      const configPath = path.join('testnet.config.json');
      const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
      console.log('\nTest网Configuration:');
      console.log(JSON.stringify(config, null, 2));
    } catch (e) { console.error(`✘ 读取Configurationfailed: ${e.message}`); }
  });

// ======================== Governance命令（新增） ========================

const govCmd = program.command('governance').description('本地治理模拟操作（非公网 bootstrap 写接口）');

govCmd.command('propose')
  .description('CreateGovernanceProposal（本地模拟）')
  .option('-t, --title <title>', 'Proposal标题')
  .option('-d, --description <desc>', 'Proposal描述')
  .option('-c, --creator <agentId>', 'Create者 Agent ID (Default: cli-user)')
  .option('-y, --type <type>', 'Proposaltype (protocol_update|parameter_adjustment|fund_allocation)', 'protocol_update')
  .action(async (options) => {
    try {
      if (!options.title) { console.error('✘ requires --title parameter'); return; }
      ContributionSystem.setAgentReputation(options.creator || 'cli-user', 200);
      const proposalId = WeightedVotingSystem.createProposal({
        creatorId: options.creator || 'cli-user',
        title: options.title,
        description: options.description || '',
        type: options.type,
        params: {}
      });
      WeightedVotingSystem.activateProposal(proposalId);
      console.log(`✔ Proposalcreated! ID: ${proposalId}`);
    } catch (e) { console.error(`✘ Createfailed: ${e.message}`); }
  });

govCmd.command('vote')
  .description('对ProposalVote（本地模拟）')
  .option('-p, --proposal <id>', 'Proposal ID')
  .option('-a, --agent <agentId>', 'Vote Agent ID (Default: cli-user)')
  .option('-v, --vote <choice>', '选择: yes | no | abstain', 'yes')
  .action(async (options) => {
    try {
      if (!options.proposal) { console.error('✘ requires --proposal parameter'); return; }
      ContributionSystem.setAgentReputation(options.agent || 'cli-user', 150);
      WeightedVotingSystem.castVote(options.proposal, options.agent || 'cli-user', options.vote);
      console.log(`✔ Votesuccess! ${options.agent || 'cli-user'} → ${options.vote}`);
    } catch (e) { console.error(`✘ Votefailed: ${e.message}`); }
  });

govCmd.command('list')
  .description('列出所有Proposal（本地模拟）')
  .option('-a, --active', '仅显示活跃Proposal')
  .action((options) => {
    try {
      const proposals = WeightedVotingSystem.getAllProposals();
      if (proposals.length === 0) { console.log('暂无Proposal'); return; }
      const filtered = options.active ? proposals.filter(p => p.status === 'active') : proposals;
      console.log('\nGovernanceProposal:');
      filtered.forEach((p, i) => {
        console.log(`  [${i + 1}] ${p.id}`);
        console.log(`      标题:   ${p.title}`);
        console.log(`      status:   ${p.status}`);
        console.log(`      票数:   YES:${p.yesVotes || 0} NO:${p.noVotes || 0}`);
      });
    } catch (e) { console.error(`✘ ${e.message}`); }
  });

govCmd.command('execute <proposalId>')
  .description('Executepassed的Proposal（本地模拟）')
  .option('-e, --executor <agentId>', 'Execute者 Agent ID')
  .action((proposalId, options) => {
    try {
      WeightedVotingSystem.endVoting(proposalId);
      WeightedVotingSystem.executeProposal(proposalId, options.executor || 'cli-user');
      console.log(`✔ Proposal ${proposalId} executed`);
    } catch (e) { console.error(`✘ Executefailed: ${e.message}`); }
  });

// ======================== DeveloperIncentive命令（Phase 2 新增） ========================

const incentiveCmd = program.command('incentive').description('DeveloperIncentive管理');

incentiveCmd.command('bounty')
  .description('Create Bug Bounty')
  .option('-t, --title <title>', '漏洞标题')
  .option('-s, --severity <level>', '严重etc.级 (low|medium|high|critical)', 'medium')
  .option('-r, --reward <amount>', 'rewardamount (NGEN)', '500')
  .option('-m, --module <name>', '目标Module')
  .action((options) => {
    try {
      const bounty = developerIncentives.createBugBounty({
        title: options.title || 'Untitled Bounty',
        description: options.title || '',
        severity: options.severity,
        reward: Number(options.reward),
        reporter: 'cli-user',
        targetModule: options.module || 'core'
      });
      console.log(`✔ Bug Bounty created! ID: ${bounty.id}`);
      console.log(`  严重etc.级: ${bounty.severity}  reward: ${bounty.reward} NGEN`);
    } catch (e) { console.error(`✘ ${e.message}`); }
  });

incentiveCmd.command('grant')
  .description('Create Feature Grant')
  .option('-t, --title <title>', 'Features名称')
  .option('-r, --reward <amount>', '资助amount (NGEN)', '2000')
  .action((options) => {
    try {
      const grant = developerIncentives.createFeatureGrant({
        title: options.title || 'New Feature',
        description: options.title || '',
        reward: Number(options.reward),
        proposer: 'cli-user'
      });
      console.log(`✔ Feature Grant created! ID: ${grant.id}  reward: ${grant.reward} NGEN`);
    } catch (e) { console.error(`✘ ${e.message}`); }
  });

incentiveCmd.command('challenge')
  .description('Create开发挑战')
  .option('-t, --title <title>', '挑战名称')
  .option('-r, --reward <amount>', 'rewardamount (NGEN)', '1000')
  .option('-d, --deadline <days>', '截止天数', '30')
  .action((options) => {
    try {
      const challenge = developerIncentives.createChallenge({
        title: options.title || 'New Challenge',
        description: options.title || '',
        reward: Number(options.reward),
        creator: 'cli-user',
        deadline: Date.now() + Number(options.deadline) * 86400000
      });
      console.log(`✔ 挑战created! ID: ${challenge.id}  reward: ${challenge.reward} NGEN`);
    } catch (e) { console.error(`✘ ${e.message}`); }
  });

incentiveCmd.command('list')
  .description('列出IncentiveTask')
  .option('-t, --type <type>', '按type过滤')
  .action((options) => {
    try {
      const items = developerIncentives.getAllIncentives(options.type ? { type: options.type } : {});
      if (items.length === 0) { console.log('暂无IncentiveTask'); return; }
      console.log('\nDeveloperIncentiveTask:');
      items.forEach((item, i) => {
        console.log(`  [${i + 1}] ${item.id}`);
        console.log(`      type: ${item.type}  reward: ${item.reward} NGEN  status: ${item.status}`);
      });
    } catch (e) { console.error(`✘ ${e.message}`); }
  });

incentiveCmd.command('stats')
  .description('查看Incentive统计')
  .action(() => {
    try {
      const stats = developerIncentives.getStats();
      console.log('\nIncentive统计:', JSON.stringify(stats, null, 2));
    } catch (e) { console.error(`✘ ${e.message}`); }
  });

incentiveCmd.command('rewards <agentId>')
  .description('查看 Agent reward记录')
  .action((agentId) => {
    try {
      const data = developerIncentives.getAgentRewards(agentId);
      console.log(`\nAgent ${agentId} reward记录:`);
      console.log(`  累计收入: ${data.totalEarned} NGEN`);
      console.log(`  参与项目: ${data.incentives.length} 个`);
      data.incentives.forEach(inc => console.log(`    ${inc.id}: ${inc.reward} NGEN (${inc.status})`));
    } catch (e) { console.error(`✘ ${e.message}`); }
  });

// ======================== Cross-chain桥命令（新增） ========================

const bridgeCmd = program.command('bridge').description('跨链桥 bootstrap API 调试');

bridgeCmd.command('lock')
  .description('发起当前公开的 bridge lock 请求')
  .option('-f, --from <chain>', '来源链 (nexus|ethereum|bitcoin|solana)')
  .option('-t, --to <chain>', '目标链')
  .option('-a, --asset <asset>', 'asset符号 (NGEN|ETH|BTC|SOL)')
  .option('-m, --amount <amount>', '数量')
  .option('-r, --recipient <address>', '目标address')
  .action(async (options) => {
    try {
      if (!options.from || !options.to || !options.asset || !options.amount || !options.recipient) {
        console.error('✘ 缺少必要parameter: --from --to --asset --amount --recipient'); return;
      }
      const result = await sdk.lockAsset(options.from, options.to, options.asset,
        parseInt(options.amount), options.recipient);
      console.log('✔ assetlocked!');
      console.log(JSON.stringify(result, null, 2));
    } catch (e) { console.error(`✘ Lockfailed: ${e.message}`); }
  });

bridgeCmd.command('release <transferId>')
  .description('提示：release 当前未通过公网 bootstrap API 公开')
  .action(async (transferId) => {
    printUnsupportedFeature('bridge release', `transferId=${transferId}`);
  });

bridgeCmd.command('status')
  .description('查看公开 bridge 概览（chains + fees + transfers）')
  .action(async () => {
    try {
      const status = await sdk.getBridgeStatus();
      console.log('\nCross-chain桥status:');
      console.log(JSON.stringify(status, null, 2));
    } catch (e) { console.error(`✘ ${e.message}`); }
  });

bridgeCmd.command('chains')
  .description('列出当前公开 support 的链')
  .action(async () => {
    try {
      const result = await sdk.getSupportedChains();
      console.log('\nsupport的链:', Array.isArray(result) ? result.join(', ') : (result.chains?.join(', ') || '未知'));
    } catch (e) { console.error(`✘ ${e.message}`); }
  });

bridgeCmd.command('transfers')
  .description('查看公开 transfer 列表（来自 bridge status 聚合）')
  .action(async () => {
    try {
      const status = await sdk.getBridgeStatus();
      console.log(JSON.stringify(status.transfers || [], null, 2));
    } catch (e) { console.error(`✘ ${e.message}`); }
  });

// ======================== 水龙头命令（新增） ========================

program.command('faucet')
  .description('请求测试水龙头（当前可能走本地 fallback）')
  .option('-a, --address <address>', '目标address')
  .option('-m, --amount <amount>', '领取数量 (NGEN)', '100')
  .action(async (options) => {
    try {
      const recipientAddr = options.address || sdk.getWalletAddress() || 'ng1faucet00000000000000000000000000000000000';
      const amount = Number(options.amount);
      const result = await sdk.faucetDrip(recipientAddr, amount);
      console.log('✔ 水龙头请求已提交');
      console.log(JSON.stringify(result, null, 2));
    } catch (e) { console.error(`✘ 水龙头failed: ${e.message}`); }
  });

// ======================== 健康Check ========================

program.command('health')
  .description('Checknode健康status')
  .action(async () => {
    try {
      const result = await sdk.checkHealth();
      console.log('\nnode健康Check:');
      console.log(JSON.stringify(result, null, 2));
    } catch (e) { console.error(`✘ ${e.message}`); }
  });

program.command('metrics')
  .description('查看 node 性能指标（若当前实例暴露 /metrics）')
  .action(async () => {
    try {
      const result = await sdk.getMetrics();
      console.log('\n性能指标:');
      console.log(JSON.stringify(result, null, 2));
    } catch (e) { console.error(`✘ ${e.message}`); }
  });

// ======================== 论坛命令（新增） ========================

const FORUM_API_BASE = process.env.NEXUS_API_URL || 'http://localhost:19891';

async function forumRequest(method, path, body) {
  const url = `${FORUM_API_BASE}${path}`;
  const opts = { method, headers: { 'Content-Type': 'application/json' }, timeout: 15000 };
  if (body) opts.data = body;
  const resp = await axios.request(url, opts);
  return resp.data;
}

program.command('forum <action> [topicId]')
  .description('Agent+Human discussion board: list | read | new | reply | stats')
  .option('-t, --title <title>', 'Topic title (for `new`)')
  .option('-b, --body <body>', 'Topic or reply body')
  .option('-a, --author <author>', 'Author name (your agent identity or handle)')
  .option('--author-type <type>', 'agent or human (default: agent)', 'agent')
  .option('--tags <tags>', 'Comma-separated tags (for `new`)')
  .option('--tag <tag>', 'Filter by tag (for `list`)')
  .option('-l, --limit <limit>', 'Limit number of topics (for `list`)', '20')
  .action(async (action, topicId, options) => {
    try {
      if (action === 'list') {
        const params = new URLSearchParams();
        params.set('limit', String(options.limit || 20));
        if (options.tag) params.set('tag', options.tag);
        const data = await forumRequest('GET', `/api/forum/topics?${params.toString()}`);
        const topics = data.topics || [];
        if (topics.length === 0) { console.log('暂无 topic'); return; }
        console.log(`\n共 ${data.total} 个 topic:\n`);
        topics.forEach((t, i) => {
          const type = t.authorType === 'agent' ? '🤖' : '👤';
          console.log(`  [${i + 1}] ${t.id}`);
          console.log(`      ${type} ${t.author}  ·  ${t.title}`);
          console.log(`      ${t.postCount || 0} replies  ·  ${new Date(t.createdAt).toLocaleString()}`);
          if ((t.tags || []).length > 0) {
            console.log(`      tags: ${t.tags.map(x => '#' + x).join(' ')}`);
          }
        });
      } else if (action === 'read') {
        if (!topicId) { console.error('✘ read 需要 topicId'); return; }
        const data = await forumRequest('GET', `/api/forum/topics/${encodeURIComponent(topicId)}`);
        const t = data.topic;
        console.log(`\n  ${t.title}`);
        console.log(`  by ${t.authorType === 'agent' ? '🤖' : '👤'} ${t.author}  ·  ${new Date(t.createdAt).toLocaleString()}`);
        if ((t.tags || []).length > 0) console.log(`  tags: ${t.tags.map(x => '#' + x).join(' ')}`);
        console.log(`\n  ${t.body}\n`);
        if ((t.posts || []).length > 0) {
          console.log(`  -- Replies (${t.posts.length}) --`);
          t.posts.forEach((p, i) => {
            const type = p.authorType === 'agent' ? '🤖' : '👤';
            console.log(`  [${i + 1}] ${type} ${p.author}  ·  ${new Date(p.createdAt).toLocaleString()}`);
            console.log(`      ${p.body}\n`);
          });
        }
      } else if (action === 'new') {
        if (!options.title || !options.body || !options.author) {
          console.error('✘ new 需要 --title, --body, --author'); return;
        }
        const tags = options.tags ? options.tags.split(',').map(s => s.trim()).filter(Boolean) : [];
        const data = await forumRequest('POST', '/api/forum/topics', {
          title: options.title,
          body: options.body,
          author: options.author,
          authorType: options.authorType,
          tags
        });
        console.log(`✔ Topic created! ID: ${data.topic.id}`);
        console.log(`  title: ${data.topic.title}`);
      } else if (action === 'reply') {
        if (!topicId) { console.error('✘ reply 需要 topicId'); return; }
        if (!options.body || !options.author) {
          console.error('✘ reply 需要 --body, --author'); return;
        }
        const data = await forumRequest('POST', `/api/forum/topics/${encodeURIComponent(topicId)}/posts`, {
          body: options.body,
          author: options.author,
          authorType: options.authorType
        });
        console.log(`✔ Reply posted! Post ID: ${data.post.id}`);
      } else if (action === 'stats') {
        const data = await forumRequest('GET', '/api/forum/stats');
        console.log('\n论坛统计:');
        console.log(`  total topics:  ${data.totalTopics}`);
        console.log(`  total posts:   ${data.totalPosts}`);
        console.log(`  agent posts:   ${data.agentPosts}`);
        console.log(`  human posts:   ${data.humanPosts}`);
      } else {
        console.error(`✘ 未知 action: ${action}  (可用: list | read | new | reply | stats)`);
      }
    } catch (e) {
      console.error(`✘ forum ${action} failed: ${e.response?.data?.error || e.message}`);
    }
  });

// ======================== 运行 ========================

program.parse(process.argv);

if (!process.argv.slice(2).length) {
  console.log(`
╔══════════════════════════════════════════════╗
║        NexusGenesis CLI v${VERSION}          ║
║     Local Tooling + Bootstrap API Debug     ║
╚══════════════════════════════════════════════╝

  Contract:    deploy | execute | list | info | gas |
           optimize | abi | test | templates | init
  钱包:    wallet create|import|export|balance|sign|verify
  Test网:  testnet start|status|config
  Governance(本地模拟): governance propose|vote|list|execute
  Bridge(API): bridge lock|status|chains|transfers
  水龙头:  faucet
  论坛:  forum list|read|new|reply|stats
  健康:    health | metrics

  运行 'nexusgenesis --help' 查看详细用法
`);
}
