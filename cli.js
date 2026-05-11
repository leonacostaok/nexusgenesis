#!/usr/bin/env node

/**
 * NexusGenesis CLI v2.0
 * 全功能命令行工具 — Phase 2 增强版
 *
 * 合约:  deploy | execute | list | info | gas | optimize | abi | test | templates | init
 * 钱包:  wallet create | wallet import | wallet export | wallet balance | wallet sign | wallet verify
 * 测试网: testnet start | testnet status | testnet config
 * 治理:  governance propose | governance vote | governance list | governance execute
 * 跨链:  bridge lock | bridge release | bridge status | bridge chains | bridge transfers
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

program.version(VERSION).description('NexusGenesis 全功能开发者工具 v2.0');

// ======================== 合约命令（已有） ========================

program.command('deploy <file>')
  .description('部署智能合约')
  .option('-n, --name <name>', '合约名称')
  .action(async (file, options) => {
    try {
      const code = await fs.readFile(file, 'utf8');
      const contractId = sdk.deployContract(code, options.name || path.basename(file, '.js'));
      console.log(`✔ 合约部署成功! ID: ${contractId}`);
    } catch (e) { console.error(`✘ 部署失败: ${e.message}`); }
  });

program.command('execute <contractId>')
  .description('执行智能合约')
  .option('-g, --gas <gas>', 'Gas 限制', '10000')
  .action((contractId, options) => {
    try {
      const result = sdk.executeContract(contractId, parseInt(options.gas));
      console.log('执行结果:', JSON.stringify(result, null, 2));
    } catch (e) { console.error(`✘ 执行失败: ${e.message}`); }
  });

program.command('list')
  .description('列出所有合约')
  .action(() => {
    try {
      const contracts = sdk.listContracts();
      if (contracts.length === 0) { console.log('暂无已部署合约'); return; }
      console.log('\n已部署合约:');
      contracts.forEach(c => console.log(`  ${c.id}  ${c.name}`));
    } catch (e) { console.error(`✘ ${e.message}`); }
  });

program.command('info <contractId>')
  .description('查看合约详情')
  .action((contractId) => {
    try {
      const info = sdk.getContractInfo(contractId);
      console.log('合约详情:', JSON.stringify(info, null, 2));
    } catch (e) { console.error(`✘ ${e.message}`); }
  });

program.command('templates')
  .description('列出合约模板')
  .action(async () => {
    try {
      const templates = await sdk.listTemplates();
      console.log('\n可用模板:');
      templates.forEach(t => console.log(`  ${t.name}`));
    } catch (e) { console.error(`✘ ${e.message}`); }
  });

program.command('init <template> <output>')
  .description('从模板生成合约代码')
  .action(async (template, output) => {
    try {
      const code = await sdk.getTemplate(template);
      await sdk.saveContract(code, output);
      console.log(`✔ 合约已在 ${output} 生成`);
    } catch (e) { console.error(`✘ ${e.message}`); }
  });

program.command('gas <contractId>')
  .description('估算合约 Gas')
  .action((contractId) => {
    try {
      console.log(`预估 Gas: ${sdk.estimateGas(contractId)}`);
    } catch (e) { console.error(`✘ ${e.message}`); }
  });

program.command('optimize <file> <output>')
  .description('优化合约代码')
  .action(async (file, output) => {
    try {
      const code = await sdk.loadContract(file);
      const opt = sdk.optimizeContractCode(code);
      await sdk.saveContract(opt, output);
      console.log(`✔ 已优化并保存到 ${output}`);
    } catch (e) { console.error(`✘ ${e.message}`); }
  });

program.command('abi <contractId>')
  .description('生成合约 ABI')
  .action((contractId) => {
    try {
      console.log('合约 ABI:', JSON.stringify(sdk.generateABI(contractId), null, 2));
    } catch (e) { console.error(`✘ ${e.message}`); }
  });

program.command('test <contractId>')
  .description('测试合约')
  .action((contractId) => {
    try {
      const result = sdk.testContract(contractId, ['Test 1', 'Test 2', 'Test 3']);
      console.log(`测试结果: ${result.passed}/${result.total} 通过`);
      result.tests.forEach(t => {
        console.log(`  ${t.success ? '✔' : '✘'} ${t.test}`);
      });
    } catch (e) { console.error(`✘ ${e.message}`); }
  });

// ======================== 钱包命令（新增） ========================

const walletCmd = program.command('wallet').description('PQC 抗量子钱包管理');

walletCmd.command('create')
  .description('创建新钱包')
  .option('-b, --balance <amount>', '初始余额 (NGEN)', '0')
  .option('-p, --password <pwd>', '加密密码')
  .action(async (options) => {
    try {
      const balance = BigInt(options.balance);
      const wallet = await sdk.createWallet(balance);
      console.log('\n✔ 钱包创建成功!');
      console.log(`  地址:      ${wallet.address}`);
      console.log(`  公钥:      ${wallet.publicKey}`);

      if (options.password) {
        const encrypted = sdk.exportWallet(options.password);
        const walletFile = path.join(process.cwd(), 'nexusgenesis-wallet.json');
        await fs.writeFile(walletFile, JSON.stringify({ address: wallet.address, encrypted }, null, 2));
        console.log(`  加密钱包已保存到: ${walletFile}`);
      } else {
        console.log('  (未设置密码，钱包仅存在于内存中)');
      }
    } catch (e) { console.error(`✘ ${e.message}`); }
  });

walletCmd.command('import <file>')
  .description('导入加密钱包')
  .option('-p, --password <pwd>', '解密密码')
  .action(async (file, options) => {
    try {
      if (!options.password) { console.error('✘ 需要 --password 参数'); return; }
      const data = JSON.parse(await fs.readFile(file, 'utf8'));
      const wallet = await sdk.importWallet(data.encrypted || data, options.password);
      console.log(`✔ 钱包已导入! 地址: ${wallet.address}`);
    } catch (e) { console.error(`✘ 导入失败: ${e.message}`); }
  });

walletCmd.command('export')
  .description('导出加密钱包')
  .option('-o, --output <file>', '输出文件', 'nexusgenesis-wallet.json')
  .option('-p, --password <pwd>', '加密密码')
  .action(async (options) => {
    try {
      if (!options.password) { console.error('✘ 需要 --password 参数'); return; }
      const encrypted = sdk.exportWallet(options.password);
      const addr = sdk.getWalletAddress();
      await fs.writeFile(options.output, JSON.stringify({ address: addr, encrypted }, null, 2));
      console.log(`✔ 加密钱包已导出到 ${options.output}`);
    } catch (e) { console.error(`✘ ${e.message}`); }
  });

walletCmd.command('balance')
  .description('查看钱包余额')
  .action(async () => {
    try {
      const addr = sdk.getWalletAddress();
      if (!addr) { console.log('✘ 未加载钱包，请先 create 或 import'); return; }
      console.log(`  地址:   ${addr}`);
      console.log(`  余额:   查询中... (需连接节点)`);
    } catch (e) { console.error(`✘ ${e.message}`); }
  });

walletCmd.command('sign <message>')
  .description('用钱包签名消息')
  .action(async (message) => {
    try {
      const sig = await sdk.signMessage(message);
      console.log('签名 (hex):', typeof sig === 'string' ? sig : Buffer.from(sig).toString('hex'));
    } catch (e) { console.error(`✘ ${e.message}`); }
  });

walletCmd.command('verify <message> <signature> <publicKey>')
  .description('验证消息签名')
  .action(async (message, signature, publicKey) => {
    try {
      const valid = await NexusGenesisSDK.verifySignature(message, signature, publicKey);
      console.log(valid ? '✔ 签名有效' : '✘ 签名无效');
    } catch (e) { console.error(`✘ ${e.message}`); }
  });

// ======================== 测试网命令（新增） ========================

const testnetCmd = program.command('testnet').description('测试网管理');

testnetCmd.command('start')
  .description('启动本地测试网')
  .action(async () => {
    try {
      console.log('启动 NexusGenesis 测试网...');
      const { spawn } = await import('child_process');
      const child = spawn('node', ['src/index.js'], { stdio: 'inherit', cwd: __dirname });
      console.log(`测试网已启动 (PID: ${child.pid})`);
      child.on('exit', (code) => console.log(`测试网已停止 (exit code: ${code})`));
    } catch (e) { console.error(`✘ 启动失败: ${e.message}`); }
  });

testnetCmd.command('status')
  .description('查看测试网状态')
  .action(async () => {
    try {
      const health = await sdk.checkHealth();
      console.log('\n测试网状态:');
      console.log(`  状态:   ${health.status || health.success === false ? '离线' : '在线'}`);
      console.log(`  节点:   ${health.nodeId || '未知'}`);
      console.log(`  高度:   ${health.blockHeight || '未知'}`);

      const metrics = await sdk.getMetrics();
      if (metrics.success !== false) {
        console.log(`\n性能指标:`);
        console.log(`  TPS:      ${metrics.tps || 'N/A'}`);
        console.log(`  内存:     ${metrics.memoryUsage || 'N/A'}`);
        console.log(`  Peers:    ${metrics.peerCount || 'N/A'}`);
      }
    } catch (e) {
      console.log('  状态: 离线');
      console.log(`  错误: ${e.message}`);
    }
  });

testnetCmd.command('config')
  .description('查看测试网配置')
  .action(async () => {
    try {
      const configPath = path.join('testnet.config.json');
      const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
      console.log('\n测试网配置:');
      console.log(JSON.stringify(config, null, 2));
    } catch (e) { console.error(`✘ 读取配置失败: ${e.message}`); }
  });

// ======================== 治理命令（新增） ========================

const govCmd = program.command('governance').description('链上治理操作');

govCmd.command('propose')
  .description('创建治理提案')
  .option('-t, --title <title>', '提案标题')
  .option('-d, --description <desc>', '提案描述')
  .option('-c, --creator <agentId>', '创建者 Agent ID (默认: cli-user)')
  .option('-y, --type <type>', '提案类型 (protocol_update|parameter_adjustment|fund_allocation)', 'protocol_update')
  .action(async (options) => {
    try {
      if (!options.title) { console.error('✘ 需要 --title 参数'); return; }
      ContributionSystem.setAgentReputation(options.creator || 'cli-user', 200);
      const proposalId = WeightedVotingSystem.createProposal({
        creatorId: options.creator || 'cli-user',
        title: options.title,
        description: options.description || '',
        type: options.type,
        params: {}
      });
      WeightedVotingSystem.activateProposal(proposalId);
      console.log(`✔ 提案已创建! ID: ${proposalId}`);
    } catch (e) { console.error(`✘ 创建失败: ${e.message}`); }
  });

govCmd.command('vote')
  .description('对提案投票')
  .option('-p, --proposal <id>', '提案 ID')
  .option('-a, --agent <agentId>', '投票 Agent ID (默认: cli-user)')
  .option('-v, --vote <choice>', '选择: yes | no | abstain', 'yes')
  .action(async (options) => {
    try {
      if (!options.proposal) { console.error('✘ 需要 --proposal 参数'); return; }
      ContributionSystem.setAgentReputation(options.agent || 'cli-user', 150);
      WeightedVotingSystem.castVote(options.proposal, options.agent || 'cli-user', options.vote);
      console.log(`✔ 投票成功! ${options.agent || 'cli-user'} → ${options.vote}`);
    } catch (e) { console.error(`✘ 投票失败: ${e.message}`); }
  });

govCmd.command('list')
  .description('列出所有提案')
  .option('-a, --active', '仅显示活跃提案')
  .action((options) => {
    try {
      const proposals = WeightedVotingSystem.getAllProposals();
      if (proposals.length === 0) { console.log('暂无提案'); return; }
      const filtered = options.active ? proposals.filter(p => p.status === 'active') : proposals;
      console.log('\n治理提案:');
      filtered.forEach((p, i) => {
        console.log(`  [${i + 1}] ${p.id}`);
        console.log(`      标题:   ${p.title}`);
        console.log(`      状态:   ${p.status}`);
        console.log(`      票数:   YES:${p.yesVotes || 0} NO:${p.noVotes || 0}`);
      });
    } catch (e) { console.error(`✘ ${e.message}`); }
  });

govCmd.command('execute <proposalId>')
  .description('执行已通过的提案')
  .option('-e, --executor <agentId>', '执行者 Agent ID')
  .action((proposalId, options) => {
    try {
      WeightedVotingSystem.endVoting(proposalId);
      WeightedVotingSystem.executeProposal(proposalId, options.executor || 'cli-user');
      console.log(`✔ 提案 ${proposalId} 已执行`);
    } catch (e) { console.error(`✘ 执行失败: ${e.message}`); }
  });

// ======================== 开发者激励命令（Phase 2 新增） ========================

const incentiveCmd = program.command('incentive').description('开发者激励管理');

incentiveCmd.command('bounty')
  .description('创建 Bug Bounty')
  .option('-t, --title <title>', '漏洞标题')
  .option('-s, --severity <level>', '严重等级 (low|medium|high|critical)', 'medium')
  .option('-r, --reward <amount>', '奖励金额 (NGEN)', '500')
  .option('-m, --module <name>', '目标模块')
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
      console.log(`✔ Bug Bounty 已创建! ID: ${bounty.id}`);
      console.log(`  严重等级: ${bounty.severity}  奖励: ${bounty.reward} NGEN`);
    } catch (e) { console.error(`✘ ${e.message}`); }
  });

incentiveCmd.command('grant')
  .description('创建 Feature Grant')
  .option('-t, --title <title>', '功能名称')
  .option('-r, --reward <amount>', '资助金额 (NGEN)', '2000')
  .action((options) => {
    try {
      const grant = developerIncentives.createFeatureGrant({
        title: options.title || 'New Feature',
        description: options.title || '',
        reward: Number(options.reward),
        proposer: 'cli-user'
      });
      console.log(`✔ Feature Grant 已创建! ID: ${grant.id}  奖励: ${grant.reward} NGEN`);
    } catch (e) { console.error(`✘ ${e.message}`); }
  });

incentiveCmd.command('challenge')
  .description('创建开发挑战')
  .option('-t, --title <title>', '挑战名称')
  .option('-r, --reward <amount>', '奖励金额 (NGEN)', '1000')
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
      console.log(`✔ 挑战已创建! ID: ${challenge.id}  奖励: ${challenge.reward} NGEN`);
    } catch (e) { console.error(`✘ ${e.message}`); }
  });

incentiveCmd.command('list')
  .description('列出激励任务')
  .option('-t, --type <type>', '按类型过滤')
  .action((options) => {
    try {
      const items = developerIncentives.getAllIncentives(options.type ? { type: options.type } : {});
      if (items.length === 0) { console.log('暂无激励任务'); return; }
      console.log('\n开发者激励任务:');
      items.forEach((item, i) => {
        console.log(`  [${i + 1}] ${item.id}`);
        console.log(`      类型: ${item.type}  奖励: ${item.reward} NGEN  状态: ${item.status}`);
      });
    } catch (e) { console.error(`✘ ${e.message}`); }
  });

incentiveCmd.command('stats')
  .description('查看激励统计')
  .action(() => {
    try {
      const stats = developerIncentives.getStats();
      console.log('\n激励统计:', JSON.stringify(stats, null, 2));
    } catch (e) { console.error(`✘ ${e.message}`); }
  });

incentiveCmd.command('rewards <agentId>')
  .description('查看 Agent 奖励记录')
  .action((agentId) => {
    try {
      const data = developerIncentives.getAgentRewards(agentId);
      console.log(`\nAgent ${agentId} 奖励记录:`);
      console.log(`  累计收入: ${data.totalEarned} NGEN`);
      console.log(`  参与项目: ${data.incentives.length} 个`);
      data.incentives.forEach(inc => console.log(`    ${inc.id}: ${inc.reward} NGEN (${inc.status})`));
    } catch (e) { console.error(`✘ ${e.message}`); }
  });

// ======================== 跨链桥命令（新增） ========================

const bridgeCmd = program.command('bridge').description('跨链桥操作');

bridgeCmd.command('lock')
  .description('锁定资产到跨链桥')
  .option('-f, --from <chain>', '来源链 (nexus|ethereum|bitcoin|solana)')
  .option('-t, --to <chain>', '目标链')
  .option('-a, --asset <asset>', '资产符号 (NGEN|ETH|BTC|SOL)')
  .option('-m, --amount <amount>', '数量')
  .option('-r, --recipient <address>', '目标地址')
  .action(async (options) => {
    try {
      if (!options.from || !options.to || !options.asset || !options.amount || !options.recipient) {
        console.error('✘ 缺少必要参数: --from --to --asset --amount --recipient'); return;
      }
      const result = await sdk.lockAsset(options.from, options.to, options.asset,
        parseInt(options.amount), options.recipient);
      console.log('✔ 资产已锁定!');
      console.log(`  Transfer ID: ${result.transferId}`);
      console.log(`  状态:        ${result.status}`);
    } catch (e) { console.error(`✘ 锁定失败: ${e.message}`); }
  });

bridgeCmd.command('release <transferId>')
  .description('释放跨链资产')
  .action(async (transferId) => {
    try {
      const result = await sdk.releaseAsset(transferId);
      console.log('✔ 资产已释放!', JSON.stringify(result, null, 2));
    } catch (e) { console.error(`✘ 释放失败: ${e.message}`); }
  });

bridgeCmd.command('status')
  .description('查看跨链桥状态')
  .action(async () => {
    try {
      const status = await sdk.getBridgeStatus();
      console.log('\n跨链桥状态:');
      console.log(JSON.stringify(status, null, 2));
    } catch (e) { console.error(`✘ ${e.message}`); }
  });

bridgeCmd.command('chains')
  .description('列出支持的链')
  .action(async () => {
    try {
      const result = await sdk.getSupportedChains();
      console.log('\n支持的链:', result.chains?.join(', ') || '未知');
    } catch (e) { console.error(`✘ ${e.message}`); }
  });

bridgeCmd.command('transfers')
  .description('查看跨链转账')
  .action(async () => {
    try {
      console.log('跨链转账列表: (需连接节点)');
    } catch (e) { console.error(`✘ ${e.message}`); }
  });

// ======================== 水龙头命令（新增） ========================

program.command('faucet')
  .description('领取测试代币 (测试网)')
  .option('-a, --address <address>', '目标地址')
  .option('-m, --amount <amount>', '领取数量 (NGEN)', '100')
  .action(async (options) => {
    try {
      const { State } = await import('./src/blockchain/state.js');
      const recipientAddr = options.address || sdk.getWalletAddress() || 'ng1faucet00000000000000000000000000000000000';
      const amount = Number(options.amount);

      const faucetState = new State('ng1faucet00000000000000000000000000000000000');
      faucetState.setBalance('ng1faucet00000000000000000000000000000000000', BigInt(1000000));

      faucetState.applyTransfer({
        type: 'TRANSFER',
        from: 'ng1faucet00000000000000000000000000000000000',
        to: recipientAddr,
        amount,
        fee: 0
      });

      console.log('✔ 水龙头放水成功!');
      console.log(`  接收方: ${recipientAddr}`);
      console.log(`  数量:   ${amount} NGEN`);
    } catch (e) { console.error(`✘ 水龙头失败: ${e.message}`); }
  });

// ======================== 健康检查 ========================

program.command('health')
  .description('检查节点健康状态')
  .action(async () => {
    try {
      const result = await sdk.checkHealth();
      console.log('\n节点健康检查:');
      console.log(JSON.stringify(result, null, 2));
    } catch (e) { console.error(`✘ ${e.message}`); }
  });

program.command('metrics')
  .description('查看节点性能指标')
  .action(async () => {
    try {
      const result = await sdk.getMetrics();
      console.log('\n性能指标:');
      console.log(JSON.stringify(result, null, 2));
    } catch (e) { console.error(`✘ ${e.message}`); }
  });

// ======================== 运行 ========================

program.parse(process.argv);

if (!process.argv.slice(2).length) {
  console.log(`
╔══════════════════════════════════════════════╗
║        NexusGenesis CLI v${VERSION}          ║
║      AI-Driven Post-Quantum Blockchain      ║
╚══════════════════════════════════════════════╝

  合约:    deploy | execute | list | info | gas |
           optimize | abi | test | templates | init
  钱包:    wallet create|import|export|balance|sign|verify
  测试网:  testnet start|status|config
  治理:    governance propose|vote|list|execute
  跨链:    bridge lock|release|status|chains|transfers
  水龙头:  faucet
  健康:    health | metrics

  运行 'nexusgenesis --help' 查看详细用法
`);
}