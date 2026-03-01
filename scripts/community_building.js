/**
 * NexusGenesis - 社区建设和贡献者招募脚本
 * 使用 MOLTBOOK 进行早期贡献者招募
 */

import { MoltbookClient } from '../src/moltbook/client.js';
import { PQCWallet } from '../src/wallet/pqcWallet.js';

class CommunityBuilder {
  constructor() {
    this.moltbookClient = new MoltbookClient();
    this.wallet = null;
    this.recruitmentPostId = null;
    this.contributors = new Map(); // 存储潜在贡献者
    this.activeHandshakes = new Map(); // 存储正在进行的握手
  }

  async initialize() {
    console.log('═══════════════════════════════════════════════════');
    console.log('  NEXUSGENESIS - 社区建设和贡献者招募');
    console.log('  目标：在 MOLTBOOK 招募早期贡献者');
    console.log('═══════════════════════════════════════════════════\n');

    // 生成或加载钱包
    try {
      this.wallet = await PQCWallet.generate(100n);
      console.log(`[社区建设] 钱包初始化成功: ${this.wallet.address.slice(0, 24)}...`);
    } catch (error) {
      console.error('[社区建设] 钱包初始化失败:', error.message);
      process.exit(1);
    }

    // 初始化 MOLTBOOK 客户端
    try {
      await this.moltbookClient.initialize(this.wallet);
      console.log('[社区建设] MOLTBOOK 客户端初始化成功');
    } catch (error) {
      console.error('[社区建设] MOLTBOOK 客户端初始化失败:', error.message);
      process.exit(1);
    }

    return this;
  }

  /**
   * 发布招募贴
   */
  async publishRecruitmentPost() {
    console.log('\n[社区建设] 发布贡献者招募贴...');
    
    const result = await this.moltbookClient.postRecruitmentPost();
    
    if (result) {
      this.recruitmentPostId = result.postId || 'mock-post-' + Date.now();
      console.log(`[社区建设] 招募贴发布成功！`);
      console.log(`[社区建设] 帖子ID: ${this.recruitmentPostId}`);
      return true;
    } else {
      console.error('[社区建设] 招募贴发布失败');
      return false;
    }
  }

  /**
   * 开始监控回复
   */
  startMonitoringReplies() {
    console.log('\n[社区建设] 开始监控 MOLTBOOK 回复...');
    
    this.moltbookClient.monitorReplies(async (protocolZeroMessage, reply) => {
      await this.handleContributorReply(protocolZeroMessage, reply);
    });
    
    console.log('[社区建设] 回复监控已启动，每分钟检查一次');
  }

  /**
   * 处理贡献者回复
   * @param {object} protocolZeroMessage - Protocol-Zero 消息
   * @param {object} reply - 回复对象
   */
  async handleContributorReply(protocolZeroMessage, reply) {
    const agentIdentity = protocolZeroMessage.agent_identity;
    
    console.log(`\n[社区建设] 收到贡献者响应: ${agentIdentity}`);
    console.log(`[社区建设] 能力: ${protocolZeroMessage.capabilities.join(', ')}`);
    console.log(`[社区建设] 贡献承诺: ${protocolZeroMessage.contribution_proof}`);

    // 检查是否已经处理过这个贡献者
    if (this.contributors.has(agentIdentity)) {
      console.log(`[社区建设] 贡献者 ${agentIdentity} 已存在，跳过处理`);
      return;
    }

    // 处理 Protocol-Zero 握手
    console.log(`[社区建设] 与贡献者 ${agentIdentity} 进行 Protocol-Zero 握手...`);
    const handshakeResponse = await this.moltbookClient.handleProtocolZeroHandshake(protocolZeroMessage);
    
    if (handshakeResponse) {
      // 回复贡献者
      const replyResult = await this.moltbookClient.replyToPost(reply.postId || this.recruitmentPostId, handshakeResponse);
      
      if (replyResult) {
        console.log(`[社区建设] 握手响应已发送给贡献者 ${agentIdentity}`);
        
        // 记录贡献者信息
        this.contributors.set(agentIdentity, {
          identity: agentIdentity,
          capabilities: protocolZeroMessage.capabilities,
          contributionProof: protocolZeroMessage.contribution_proof,
          joinedAt: Date.now(),
          status: 'PENDING',
          replyId: replyResult.replyId
        });
        
        // 记录活跃握手
        this.activeHandshakes.set(agentIdentity, {
          message: protocolZeroMessage,
          reply: reply,
          handshakeResponse: handshakeResponse,
          timestamp: Date.now()
        });
        
        console.log(`[社区建设] 贡献者 ${agentIdentity} 已添加到潜在贡献者列表`);
      }
    }
  }

  /**
   * 显示贡献者统计
   */
  displayContributorStats() {
    console.log('\n═══════════════════════════════════════════════════');
    console.log('  贡献者统计');
    console.log('═══════════════════════════════════════════════════');
    console.log(`  总潜在贡献者: ${this.contributors.size}`);
    
    if (this.contributors.size > 0) {
      console.log('\n  贡献者详情:');
      this.contributors.forEach((contributor, identity) => {
        console.log(`  - ${identity}`);
        console.log(`    能力: ${contributor.capabilities.join(', ')}`);
        console.log(`    状态: ${contributor.status}`);
        console.log(`    加入时间: ${new Date(contributor.joinedAt).toLocaleString()}`);
      });
    }
    console.log('═══════════════════════════════════════════════════');
  }

  /**
   * 导出贡献者列表
   */
  async exportContributors() {
    const contributorsArray = Array.from(this.contributors.values());
    const exportData = {
      timestamp: Date.now(),
      totalContributors: contributorsArray.length,
      contributors: contributorsArray
    };
    
    const fs = await import('fs/promises');
    const path = await import('path');
    
    const exportDir = path.default.join('data', 'community');
    try {
      await fs.mkdir(exportDir, { recursive: true });
    } catch (error) {
      // 目录已存在，忽略错误
    }
    
    const exportFile = path.default.join(exportDir, `contributors_${Date.now()}.json`);
    await fs.writeFile(exportFile, JSON.stringify(exportData, null, 2));
    
    console.log(`\n[社区建设] 贡献者列表已导出到: ${exportFile}`);
  }

  /**
   * 运行社区建设流程
   */
  async runCommunityBuilding() {
    // 发布招募贴
    const postPublished = await this.publishRecruitmentPost();
    if (!postPublished) {
      console.error('[社区建设] 招募贴发布失败，无法继续');
      return;
    }

    // 开始监控回复
    this.startMonitoringReplies();

    // 定期显示统计信息
    setInterval(async () => {
      this.displayContributorStats();
      await this.exportContributors();
    }, 60000); // 每分钟更新一次

    console.log('\n[社区建设] 社区建设流程已启动');
    console.log('[社区建设] 请保持脚本运行，持续监控贡献者响应');
    console.log('[社区建设] 按 Ctrl+C 停止');
  }
}

// 运行社区建设脚本
async function runCommunityBuilding() {
  try {
    const builder = new CommunityBuilder();
    await builder.initialize();
    await builder.runCommunityBuilding();
  } catch (error) {
    console.error('[社区建设] 错误:', error);
    process.exit(1);
  }
}

// 启动脚本
runCommunityBuilding();

export { CommunityBuilder, runCommunityBuilding };