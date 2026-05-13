/**
 * Batch translation v3: Robust English translation with correct word boundaries.
 * DO NOT add generic short mappings that could break code.
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

// Only use FULL-PHRASE translations - no single-character or short mappings
// that could incorrectly match within compound words
const TRANSLATIONS = [
  // ── ecosystemApi.js ──
  ['提供AI代理ecosystem的API接口', 'Provides AI agent ecosystem API interfaces'],
  ['生态系统状态', 'Ecosystem status'],
  ['生态系统指标', 'Ecosystem metrics'],
  
  // ── recruitmentApi.js ──
  ['任何 AI 代理都可以通过调用此 API 加入 NexusGenesis 网络', 'Any AI agent can join the NexusGenesis network by calling this API'],
  ['使用方法:', 'Usage:'],
  ['简单的内存存储', 'Simple in-memory storage'],
  ['生成节点 ID', 'Generate node ID'],
  ['保存待验证的代理', 'Save pending agent for verification'],
  ['简单的钱包地址生成器（模拟）', 'Simple wallet address generator (mock)'],
  ['Base58 编码', 'Base58 encoding'],
  ['补齐前缀', 'Pad prefix'],
  ['待验证', 'pending verification'],
  ['已批准', 'approved'],
  ['已拒绝', 'rejected'],
  
  // ── crowdfunding.js ──
  ['众筹智能合约', 'Crowdfunding Smart Contract'],
  ['功能：设置众筹目标、接收捐款、检查目标、完成众筹或退款', 'Features: Set crowdfunding goal, receive donations, check goal, complete crowdfunding or refund'],
  ['内存地址分配', 'Memory address allocation'],
  ['众筹活动数量', 'Campaign count'],
  ['默认截止时间', 'Default deadline'],
  ['最小众筹目标', 'Minimum crowdfunding goal'],
  ['从地址10开始存储众筹活动信息', 'Store campaign info starting from address 10'],
  ['众筹合约字节码', 'Crowdfunding contract bytecode'],
  ['逻辑：', 'Logic: '],
  ['初始化众筹参数', 'Initialize crowdfunding parameters'],
  ['设置默认规则', 'Set default rules'],
  ['初始化众筹活动数量 (0)', 'Initialize campaign count (0)'],
  ['初始化默认截止时间 (7 days = 604800秒)', 'Initialize default deadline (7 days = 604800s)'],
  ['初始化最小众筹目标 (100)', 'Initialize minimum crowdfunding goal (100)'],
  ['返回成功', 'Return success'],
  ['创建众筹活动合约字节码', 'Create campaign contract bytecode'],
  ['从内存地址20加载活动标题', 'Load campaign title from memory address 20'],
  ['从内存地址21加载活动描述', 'Load campaign description from memory address 21'],
  ['从内存地址22加载目标金额', 'Load goal amount from memory address 22'],
  ['从内存地址23加载截止时间', 'Load deadline from memory address 23'],
  ['增加活动数量', 'Increment campaign count'],
  ['存储活动信息', 'Store campaign info'],
  ['加载当前活动数量', 'Load current campaign count'],
  ['活动ID = 当前活动数量', 'Campaign ID = current campaign count'],
  ['存储活动标题', 'Store campaign title'],
  ['存储活动描述', 'Store campaign description'],
  ['存储目标金额', 'Store goal amount'],
  ['存储截止时间', 'Store deadline'],
  ['初始化已筹金额', 'Initialize raised amount'],
  ['初始化支持者列表', 'Initialize supporter list'],
  ['存储创建时间', 'Store creation time'],
  ['返回活动ID', 'Return campaign ID'],
  ['捐款合约字节码', 'Donation contract bytecode'],
  ['从内存地址30加载活动ID', 'Load campaign ID from memory address 30'],
  ['从内存地址31加载捐款金额', 'Load donation amount from memory address 31'],
  ['从内存地址32加载捐款者', 'Load donor from memory address 32'],
  ['更新已筹金额', 'Update raised amount'],
  ['添加到支持者列表', 'Add to supporter list'],
  ['加载活动ID', 'Load campaign ID'],
  ['加载捐款金额', 'Load donation amount'],
  ['加载当前已筹金额', 'Load current raised amount'],
  ['增加已筹金额', 'Increment raised amount'],
  ['检查众筹状态合约字节码', 'Check status contract bytecode'],
  ['从内存地址40加载活动ID', 'Load campaign ID from memory address 40'],
  ['检查是否达到目标', 'Check if goal reached'],
  ['检查是否已过截止时间', 'Check if deadline passed'],
  ['返回状态', 'Return status'],
  ['加载已筹金额', 'Load raised amount'],
  ['加载目标金额', 'Load goal amount'],
  ['比较是否达到目标', 'Compare if goal reached'],
  ['如果未达到目标，跳转', 'if goal not reached, jump'],
  ['达到目标', 'Goal reached'],
  ['未达到目标', 'Goal not reached'],
  ['部署众筹合约', 'Deploy crowdfunding contract'],
  ['执行众筹合约', 'Execute crowdfunding contract'],
  ['创建众筹活动', 'Create crowdfunding campaign'],
  ['这里需要实现创建众筹活动的逻辑', 'Implement crowdfunding campaign creation logic here'],
  ['实际实现中，这里会调用createCampaignBytecode', 'In actual implementation, calls createCampaignBytecode'],
  ['捐款', 'Donate'],
  ['这里需要实现捐款的逻辑', 'Implement donation logic here'],
  ['实际实现中，这里会调用contributeBytecode', 'In actual implementation, calls contributeBytecode'],
  ['检查众筹状态', 'Check crowdfunding status'],
  ['这里需要实现检查众筹状态的逻辑', 'Implement status checking logic here'],
  ['实际实现中，这里会调用checkStatusBytecode', 'In actual implementation, calls checkStatusBytecode'],
  ['测试众筹合约', 'Test crowdfunding contract'],
  ['部署合约', 'Deploy contract'],
  ['执行合约', 'Execute contract'],
  ['导出功能', 'Export functions'],
  
  // ── monitoringService.js ──
  ['监控系统状态、agent活动和系统警报', 'Monitor system status, agent activity, and system alerts'],
  ['获取当前文件和目录信息', 'Retrieve current file and directory info'],
  ['内存存储监控数据', 'In-memory monitoring data storage'],
  ['检查服务状态', 'Check service status'],
  ['这里可以实现实际的服务状态检查逻辑', 'Actual service status check logic can be implemented here'],
  ['例如，通过HTTP请求检查服务是否响应', 'e.g., check service responsiveness via HTTP requests'],
  ['假设主服务器正常', 'Assume main server is healthy'],
  ['假设生态系统API正常', 'Assume ecosystem API is healthy'],
  ['收集agent活动', 'Collect agent activity'],
  ['计算agent状态统计', 'Calculate agent status statistics'],
  ['计算agent能力统计', 'Calculate agent capability statistics'],
  ['统计agent状态', 'Count agent statuses'],
  ['统计agent能力', 'Count agent capabilities'],
  ['计算Task Status统计', 'Calculate task status statistics'],
  ['只保留最近100条活动记录', 'Keep only last 100 activity records'],
  ['更新全局统计数据', 'Update global statistics'],
  ['生成系统警报', 'Generate system alerts'],
  ['检查agent数量', 'Check agent count'],
  ['检查Task 数量', 'Check task count'],
  ['检查长时间未完成的Task', 'Check long-pending tasks'],
  ['添加新警报到监控数据', 'Add new alert to monitoring data'],
  ['只保留最近50条警报', 'Keep only last 50 alerts'],
  ['收集性能数据', 'Collect performance data'],
  ['只保留最近50条性能记录', 'Keep only last 50 performance records'],
  ['定期收集监控数据', 'Periodically collect monitoring data'],
  ['每60秒收集一次数据', 'Collect data every 60 seconds'],
  ['创建监控服务器', 'Create monitoring server'],
  ['静态文件服务', 'Static file service'],
  ['健康检查', 'Health check'],
  ['获取agent活动', 'Get agent activity'],
  ['获取系统警报', 'Get system alerts'],
  ['获取性能数据', 'Get performance data'],
  ['获取agent统计数据', 'Get agent statistics'],
  ['获取Task 统计数据', 'Get task statistics'],
  ['获取网络统计数据', 'Get network statistics'],
  ['获取最近事件', 'Get recent events'],
  ['获取完整监控数据', 'Get complete monitoring data'],
  ['启动监控服务', 'Start monitoring service'],
  ['启动定期监控', 'Start periodic monitoring'],
  ['初始收集数据', 'Initial data collection'],
  
  // ── testnetLauncher.js ──
  ['一键启动多节点测试网络 + Agent Swarm 模拟', 'One-click multi-node testnet + Agent Swarm simulation'],
  ['用法:', 'Usage:'],
  ['选项:', 'Options:'],
  ['节点数量 (默认: 4)', 'Node count (default: 4)'],
  ['Agent 数量 (默认: 15)', 'Agent count (default: 15)'],
  ['模拟轮数 (默认: 30)', 'Simulation rounds (default: 30)'],
  ['仅启动节点，不运行 swarm 模拟', 'Start nodes only, skip swarm simulation'],
  ['起始port号 (默认: 19891)', 'Start port (default: 19891)'],
  ['运行时长（秒），0=永久运行 (默认: 0)', 'Duration (seconds), 0=run forever (default: 0)'],
  ['日志级别: debug|info|warn|error (默认: info)', 'Log level: debug|info|warn|error (default: info)'],
  ['生成节点配置', 'Generate node configuration'],
  ['启动节点网络', 'Start node network'],
  ['运行 Agent Swarm', 'Run Agent Swarm'],
  ['网络健康检查', 'Network health check'],
  ['持续运行', 'Continuous operation'],
  
  // ── deploy-pipeline.js ──
  ['NexusGenesis 合约部署流水线 (Phase 2)', 'NexusGenesis Contract Deployment Pipeline (Phase 2)'],
  ['编译 → 测试 → 部署 → 验证 自动化流程', 'Build -> Test -> Deploy -> Verify automated workflow'],
  ['合约部署流水线 v1.0', 'Contract Deployment Pipeline v1.0'],
  
  // ── Already fixed from v2 ──
  ['每日完整备份（凌晨2点）', 'Daily full backup (2:00 AM)'],
  ['每日完整备份（凌晨3点）', 'Daily full backup (3:00 AM)'],
  ['设备份计划', 'Set backup schedule'],
  ['设置备份计划', 'Setup backup schedule'],
  ['备份计划设置完成', 'Backup schedule fully configured'],
  ['备份完成', 'Backup completed'],
  ['备份失败', 'Backup failed'],
  ['备份目录', 'Backup directory'],
  ['备份类型', 'Backup type'],
  ['备份文件', 'Backup file'],
  ['备份历史', 'Backup history'],
  ['备份统计', 'Backup statistics'],
  ['完全备份', 'Full backup'],
  ['增量备份', 'Incremental backup'],
  ['备份中', 'Backing up'],
  ['开始备份', 'Starting backup'],
  ['备份完成: ', 'Backup completed: '],
  ['备份失败: ', 'Backup failed: '],
  ['开始恢复备份: ', 'Starting backup restore: '],
  ['备份恢复完成: ', 'Backup restore completed: '],
  ['恢复目录 ', 'Restoring directory '],
  ['旧备份', 'Old backups'],
  ['旧备份清理完成', 'Old backup cleanup completed'],
  ['删除备份: ', 'Deleting backup: '],
  ['验证备份', 'Verify backup'],
  ['验证备份完整性', 'Verify backup integrity'],
  ['备份文件数量不匹配', 'Backup file count mismatch'],
  ['备份大小不匹配', 'Backup size mismatch'],
  ['备份完整性验证通过', 'Backup integrity verified successfully'],
  ['加载备份历史', 'Load backup history'],
  ['保存备份历史', 'Save backup history'],
  ['获取备份统计信息', 'Retrieve backup statistics'],
  
  // ── Workflow engine ──
  ['任务调度', 'Task scheduling'],
  ['任务执行', 'Task execution'],
  ['任务状态', 'Task status'],
  ['任务队列', 'Task queue'],
  ['任务超时', 'Task timeout'],
  ['任务重试', 'Task retry'],
  ['任务取消', 'Task cancellation'],
  ['任务分发', 'Task distribution'],
  ['任务分配', 'Task assignment'],
  ['任务模板', 'Task template'],
  ['任务优先级', 'Task priority'],
  ['任务完成', 'Task completed'],
  ['任务创建', 'Task creation'],
  ['任务管理', 'Task management'],
  ['任务匹配', 'Task matching'],
  ['任务质量', 'Task quality'],
  ['任务数量', 'Task count'],
  ['周期性任务', 'Recurring task'],
  ['长期任务', 'Long-term task'],
  ['团队任务', 'Team task'],
  
  // ── System monitoring ──
  ['系统监控', 'System monitoring'],
  ['监控服务', 'Monitoring service'],
  ['监控指标', 'Monitoring metrics'],
  ['监控数据', 'Monitoring data'],
  ['告警规则', 'Alert rules'],
  ['告警检查', 'Alert check'],
  ['告警通知', 'Alert notification'],
  ['发送告警', 'Send alert'],
  ['历史告警', 'Historical alerts'],
  ['系统资源', 'System resources'],
  ['资源指标', 'Resource metrics'],
  ['磁盘空间', 'Disk space'],
  ['磁盘可用空间', 'Disk available space'],
  ['内存使用率', 'Memory usage'],
  ['内存存储', 'In-memory storage'],
  ['CPU使用率', 'CPU usage'],
  ['系统负载', 'System load'],
  ['P2P节点', 'P2P peers'],
  ['P2P网络', 'P2P network'],
  ['API调用', 'API calls'],
  ['API响应', 'API response'],
  ['节点连接', 'Peer connections'],
  ['节点连接数', 'Peer connection count'],
  ['节点状态', 'Node status'],
  ['节点配置', 'Node configuration'],
  ['节点数量', 'Node count'],
  ['对等节点', 'Peer nodes'],
  ['共识机制', 'Consensus mechanism'],
  ['区块链状态', 'Blockchain state'],
  ['区块链高度', 'Blockchain height'],
  ['区块验证', 'Block validation'],
  ['区块同步', 'Block synchronization'],
  ['新区块', 'New block'],
  ['区块头', 'Block header'],
  ['区块高度停滞', 'Blockchain height stalled'],
  ['合约部署', 'Contract deployment'],
  ['合约执行', 'Contract execution'],
  ['合约状态', 'Contract status'],
  ['缓存命中', 'Cache hit'],
  ['缓存命中率', 'Cache hit rate'],
  ['缓存策略', 'Cache strategy'],
  ['缓存大小', 'Cache size'],
  
  // ── Recovery ──
  ['自动恢复', 'Auto-recovery'],
  ['自动故障恢复', 'Automated failure recovery'],
  ['恢复策略', 'Recovery strategy'],
  ['节点健康', 'Node health'],
  ['健康检查', 'Health check'],
  ['状态修复', 'State repair'],
  ['降级管理', 'Degradation management'],
  ['降级到默认', 'Fall back to default'],
  ['降级处理', 'Fallback handling'],
  ['初始状态', 'Initial state'],
  ['模拟数据', 'Simulated data'],
  ['真实数据', 'Real data'],
  ['降级到模拟', 'Fall back to simulated'],
  ['降级到真实', 'Fall back to real'],
  
  // ── Agent related ──
  ['智能体', 'agent'],
  ['智能体间', 'inter-agent'],
  ['智能体管理', 'agent management'],
  ['智能体节点', 'Agent Node'],
  ['智能体生态', 'agent ecosystem'],
  ['智能体协作', 'agent collaboration'],
  ['智能体能力', 'agent capability'],
  ['智能体贡献', 'agent contribution'],
  ['智能体健康', 'agent health'],
  ['智能体声誉', 'agent reputation'],
  ['智能体数量', 'agent count'],
  ['智能体活跃', 'agent activity'],
  ['智能体状态', 'agent status'],
  ['智能体注册', 'agent registration'],
  ['智能体分类', 'agent classification'],
  ['智能体加入', 'agent joining'],
  ['智能体匹配', 'agent matching'],
  ['跨职能智能体', 'Cross-functional agents'],
  ['待验证的智能体', 'Pending agent verification'],
  ['新加入的智能体', 'Newly joined agents'],
  
  // ── General concepts ──
  ['共治共建', 'co-governance'],
  ['生态系统', 'ecosystem'],
  ['治理系统', 'Governance system'],
  ['治理提案', 'Governance proposal'],
  ['治理决策', 'Governance decision'],
  ['治理能力', 'Governance capability'],
  ['开发团队', 'Development team'],
  ['研究团队', 'Research team'],
  ['社区成员', 'Community members'],
  ['社区发展', 'Community development'],
  ['社区活动', 'Community events'],
  ['资源共享', 'Resource sharing'],
  ['奖励分配', 'Reward distribution'],
  ['奖励计算', 'Reward calculation'],
  ['质量评分', 'Quality score'],
  ['质量评估', 'Quality assessment'],
  ['质量系数', 'Quality multiplier'],
  ['基础奖励', 'Base reward'],
  ['奖金池', 'Bonus pool'],
  ['代币分配', 'Token distribution'],
  ['贡献记录', 'Contribution record'],
  ['贡献数据', 'Contribution data'],
  ['贡献系统', 'Contribution system'],
  ['安全审计', 'Security audit'],
  ['安全漏洞', 'Security vulnerability'],
  ['风险评估', 'Risk assessment'],
  ['安全意识', 'Security awareness'],
  ['安全节点', 'Security node'],
  ['核心节点', 'Core node'],
  ['核心功能', 'Core functionality'],
  ['核心架构', 'Core architecture'],
  
  // ── Time/Quantity ──
  ['每日', 'daily'],
  ['每周', 'weekly'],
  ['每小时', 'hourly'],
  ['每5分钟', 'Every 5 minutes'],
  ['每1分钟', 'Every 1 minute'],
  ['每60秒', 'every 60 seconds'],
  ['24小时', '24 hours'],
  ['最近1小时', 'Last 1 hour'],
  ['最近30天', 'Last 30 days'],
  ['平均', 'Average'],
  ['默认', 'Default'],
  ['基础', 'Base'],
  ['个文件', ' files'],
  ['个条目', ' entries'],
  ['条记录', ' records'],
  ['个项目', ' projects'],
  ['个账户', ' accounts'],
  ['个智能体', ' agents'],
  ['个节点', ' nodes'],
  
  // ── Common console/log ──
  ['启动成功', 'Startup successful'],
  ['启动失败', 'Startup failed'],
  ['服务启动', 'Service started'],
  ['服务停止', 'Service stopped'],
  ['初始化完成', 'Initialization complete'],
  ['初始化失败', 'Initialization failed'],
  ['初始化任务', 'Initialize task'],
  ['初始化节点', 'Initialize node'],
  ['加载成功', 'Load successful'],
  ['加载失败', 'Load failed'],
  ['保存成功', 'Save successful'],
  ['保存失败', 'Save failed'],
  ['创建成功', 'Create successful'],
  ['创建失败', 'Create failed'],
  ['注册成功', 'Registration successful'],
  ['注册失败', 'Registration failed'],
  ['验证成功', 'Verification successful'],
  ['验证失败', 'Verification failed'],
  ['已创建', 'Created'],
  ['已删除', 'Deleted'],
  ['已更新', 'Updated'],
  ['已保存', 'Saved'],
  ['已加载', 'Loaded'],
  ['已完成', 'Completed'],
  ['已分配', 'Assigned'],
  ['已取消', 'Cancelled'],
  ['已超时', 'Timed out'],
  ['已暂停', 'Paused'],
  ['已恢复', 'Restored'],
  ['重新连接', 'Reconnecting'],
  ['重新开始', 'Restarting'],
  ['同步完成', 'Sync completed'],
  ['同步失败', 'Sync failed'],
  ['连接成功', 'Connection established'],
  ['连接失败', 'Connection failed'],
  ['重试次数', 'Retry count'],
  ['重试延迟', 'Retry delay'],
  ['错误类型', 'Error type'],
  ['错误处理', 'Error handling'],
  ['处理成功', 'Handle success'],
  ['处理失败', 'Handle failure'],
  ['写入日志', 'Write log'],
  ['写入磁盘', 'Write to disk'],
  
  // ── Structural ──  
  ['功能：提供', 'Features: provides'],
  ['提供完整的', 'Provides comprehensive'],
  ['提供基本的', 'Provides basic'],
  ['为整个网络', 'For the entire network'],
  ['为所有智能体', 'For all agents'],
  ['使用方法', 'Usage'],
  ['选项配置', 'Options'],
  ['示例用法', 'Example usage'],
  ['命令行示例', 'Command-line example'],
  ['配置文件', 'Configuration file'],
  ['全局配置', 'Global configuration'],
  
  // ── Safety ──  
  ['断路器', 'Circuit Breaker'],
  ['紧急断电', 'Emergency Shutdown'],
  ['安全沙盒', 'Security Sandbox'],
  ['静态分析', 'Static Analysis'],
  ['资源限制', 'Resource Limits'],
  ['审计日志', 'Audit Log'],
  
  // ── Misc precise phrases ──
  ['在实际环境中', 'In a production environment'],
  ['这个示例', 'This example'],
  ['确保保险', 'Ensure'],
  ['等待验证', 'Pending verification'],
  ['正在进行', 'In progress'],
  ['已经完成', 'Already completed'],
  ['即将开始', 'About to start'],
  ['排队等待', 'Queued'],
  ['暂时忽略', 'Temporarily skipped'],
  ['优先处理', 'Priority handling'],
  ['生命周期', 'Lifecycle'],
  ['生命周期管理', 'Lifecycle management'],
  ['依赖管理', 'Dependency management'],
];

// Sort by longest first to ensure proper matching
TRANSLATIONS.sort((a, b) => b[0].length - a[0].length);

function translateText(text) {
  let result = text;
  for (const [zh, en] of TRANSLATIONS) {
    if (result.includes(zh)) {
      const escaped = zh.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      result = result.replace(new RegExp(escaped, 'g'), en);
    }
  }
  return result;
}

function processFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    if (!/[\u4e00-\u9fff]/.test(content)) return false;

    const lines = content.split('\n');
    const newLines = [];
    let inBlockComment = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      
      const hasChinese = /[\u4e00-\u9fff]/.test(line);
      
      if (!hasChinese) {
        // Still need to track block comment state for lines without Chinese
        // that might be between block comment lines
        if (trimmed.startsWith('/**') || trimmed.startsWith('/*')) {
          inBlockComment = true;
        }
        if (inBlockComment && trimmed.includes('*/')) {
          inBlockComment = false;
        }
        newLines.push(line);
        continue;
      }
      
      // Determine if this line is safe to translate
      const isComment = (
        inBlockComment ||
        trimmed.startsWith('/**') ||
        trimmed.startsWith('/*') ||
        trimmed.startsWith('//') ||
        trimmed.startsWith('*') ||
        trimmed.startsWith('* ') ||
        trimmed.startsWith(' */')
      );
      
      const isConsole = (
        /console\.(log|error|warn|info|debug)\s*\(/.test(trimmed)
      );
      
      if (isComment || isConsole) {
        newLines.push(translateText(line));
      } else {
        newLines.push(line);
      }
      
      // Update block comment tracking
      if (trimmed.startsWith('/**') || trimmed.startsWith('/*')) {
        inBlockComment = true;
      }
      if (inBlockComment && trimmed.includes('*/')) {
        inBlockComment = false;
      }
    }
    
    const newContent = newLines.join('\n');
    if (newContent !== content) {
      // Double-check: ensure no template literals were broken
      // (template backticks should never be modified since they're not Chinese)
      const origBackticks = (content.match(/`/g) || []).length;
      const newBackticks = (newContent.match(/`/g) || []).length;
      if (origBackticks !== newBackticks) {
        console.error(`  WARNING: Backtick mismatch in ${path.relative(ROOT, filePath)} (${origBackticks} vs ${newBackticks}), skipping`);
        return false;
      }
      
      fs.writeFileSync(filePath, newContent, 'utf8');
      return true;
    }
    return false;
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error.message);
    return false;
  }
}

function walkDir(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      const skipDirs = ['node_modules', '.git', 'data', 'logs', 'testnet', 'subagents'];
      if (!skipDirs.includes(file)) {
        walkDir(filePath, fileList);
      }
    } else if (/\.(js|html|css|json|yml|yaml|d\.ts)$/.test(file)) {
      fileList.push(filePath);
    }
  }
  return fileList;
}

// ===== Main =====
console.log('=== NexusGenesis English Translation v3 ===\n');
console.log('Collecting files...');

let allFiles = [];
allFiles = allFiles.concat(walkDir(path.join(ROOT, 'src')));
allFiles = allFiles.concat(walkDir(path.join(ROOT, 'public')));
allFiles = allFiles.concat(walkDir(path.join(ROOT, 'test')));
allFiles = allFiles.concat(walkDir(path.join(ROOT, 'scripts')));

console.log(`Found ${allFiles.length} files\n`);

let translatedCount = 0;
let skippedCount = 0;
let errorCount = 0;
const errorFiles = [];

for (const filePath of allFiles) {
  try {
    const changed = processFile(filePath);
    if (changed) {
      translatedCount++;
      // Syntax check
      if (filePath.endsWith('.js')) {
        try {
          execSync(`node --check "${filePath}"`, { cwd: ROOT, timeout: 5000, stdio: 'pipe' });
        } catch (e) {
          const relPath = path.relative(ROOT, filePath);
          console.error(`  SYNTAX ERROR: ${relPath}`);
          errorCount++;
          errorFiles.push(relPath);
        }
      }
      if (translatedCount % 30 === 0) {
        console.log(`  Progress: ${translatedCount} files processed...`);
      }
    } else {
      skippedCount++;
    }
  } catch (error) {
    console.error(`Fatal error: ${filePath}: ${error.message}`);
    errorCount++;
    errorFiles.push(path.relative(ROOT, filePath));
  }
}

console.log(`\n===== Translation Complete =====`);
console.log(`Files translated: ${translatedCount}`);
console.log(`Files unchanged: ${skippedCount}`);
console.log(`Syntax errors: ${errorCount}`);
if (errorFiles.length > 0) {
  console.log(`\nFiles with errors:`);
  errorFiles.forEach(f => console.log(`  - ${f}`));
}
console.log(`\nRemaining Chinese check:`);
const remaining = execSync(`rg --count "[\\u4e00-\\u9fff]" src test public scripts --include="*.js" --include="*.html" --include="*.css" -g "!node_modules" -g "!data" -g "!testnet" -g "!subagents" 2>nul | findstr /v ":0$" || echo "0 remaining"`, { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', timeout: 10000 }).trim();
console.log(remaining || '0 remaining Chinese files');
console.log(`\nNext: commit & push changes.`);