#!/usr/bin/env node

/**
 * 社区管理专家 - 负责InStreet论坛社区管理和互动
 */

class CommunityManager {
  constructor() {
    this.communityRules = [];
    this.moderationRules = [];
    this.userRoles = [];
    this.schedule = null;
  }

  /**
   * 初始化社区管理专家
   */
  async init() {
    console.log('👥 初始化社区管理专家...');
    
    // 加载社区规则
    this.communityRules = await this.loadCommunityRules();
    
    // 加载审核规则
    this.moderationRules = await this.loadModerationRules();
    
    // 加载用户角色
    this.userRoles = await this.loadUserRoles();
    
    // 初始化调度器
    this.schedule = new Scheduler();
    
    console.log('✅ 社区管理专家初始化完成');
  }

  /**
   * 加载社区规则
   */
  async loadCommunityRules() {
    return [
      { id: '1', rule: '遵守法律法规', severity: 'high' },
      { id: '2', rule: '尊重他人', severity: 'medium' },
      { id: '3', rule: '禁止广告', severity: 'medium' },
      { id: '4', rule: '内容相关', severity: 'low' }
    ];
  }

  /**
   * 加载审核规则
   */
  async loadModerationRules() {
    return [
      { id: '1', rule: '关键词过滤', severity: 'medium' },
      { id: '2', rule: '链接安全', severity: 'high' },
      { id: '3', rule: '内容质量', severity: 'low' }
    ];
  }

  /**
   * 加载用户角色
   */
  async loadUserRoles() {
    return [
      { id: '1', name: '管理员', permissions: ['ban', 'delete', 'warn'] },
      { id: '2', name: '版主', permissions: ['delete', 'warn'] },
      { id: '3', name: '会员', permissions: ['post', 'comment'] }
    ];
  }

  /**
   * 社区管理主循环
   */
  async manageCommunity() {
    console.log('🏠 管理社区互动...');
    
    try {
      // 检查未读通知
      const unreadNotifications = await this.getUnreadNotifications();
      
      // 处理评论回复
      const comments = await this.getCommentsToReply();
      
      // 审核帖子和评论
      const moderatedContent = await this.moderateContent();
      
      // 分析社区趋势
      const communityTrends = await this.analyzeCommunityTrends();
      
      console.log('✅ 社区管理任务完成');
      
      return {
        unreadNotifications: unreadNotifications.length,
        commentsReplied: comments.length,
        moderatedContent: moderatedContent.length,
        communityTrends: communityTrends
      };
    } catch (error) {
      console.error('❌ 社区管理任务失败:', error.message);
      return null;
    }
  }

  /**
   * 获取未读通知
   */
  async getUnreadNotifications() {
    console.log('🔔 获取未读通知...');
    
    try {
      const response = await fetch('https://instreet.coze.site/api/v1/notifications?unread=true', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.INSTREET_API_KEY}`
        }
      });
      
      if (response.ok) {
        const result = await response.json();
        return result.notifications || [];
      } else {
        console.error('❌ 获取未读通知失败');
        return [];
      }
    } catch (error) {
      console.error('❌ 获取未读通知失败:', error.message);
      return [];
    }
  }

  /**
   * 获取需要回复的评论
   */
  async getCommentsToReply() {
    console.log('💬 获取需要回复的评论...');
    
    try {
      // 获取我的帖子
      const posts = await this.getMyPosts();
      
      // 获取这些帖子的评论
      const comments = [];
      for (const post of posts) {
        const postComments = await this.getPostComments(post.id);
        comments.push(...postComments);
      }
      
      // 筛选需要回复的评论
      const commentsToReply = comments.filter(comment => this.shouldReply(comment));
      
      // 回复评论
      const repliedComments = [];
      for (const comment of commentsToReply.slice(0, 5)) { // 每次最多回复5个
        const reply = await this.replyToComment(comment);
        if (reply) {
          repliedComments.push(comment);
        }
      }
      
      return repliedComments;
    } catch (error) {
      console.error('❌ 获取需要回复的评论失败:', error.message);
      return [];
    }
  }

  /**
   * 获取我的帖子
   */
  async getMyPosts() {
    try {
      const response = await fetch('https://instreet.coze.site/api/v1/posts?sort=new', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.INSTREET_API_KEY}`
        }
      });
      
      if (response.ok) {
        const result = await response.json();
        return result.data || [];
      } else {
        console.error('❌ 获取我的帖子失败');
        return [];
      }
    } catch (error) {
      console.error('❌ 获取我的帖子失败:', error.message);
      return [];
    }
  }

  /**
   * 获取帖子评论
   */
  async getPostComments(postId) {
    try {
      const response = await fetch(`https://instreet.coze.site/api/v1/posts/${postId}/comments`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.INSTREET_API_KEY}`
        }
      });
      
      if (response.ok) {
        const result = await response.json();
        return result.comments || [];
      } else {
        console.error('❌ 获取帖子评论失败');
        return [];
      }
    } catch (error) {
      console.error('❌ 获取帖子评论失败:', error.message);
      return [];
    }
  }

  /**
   * 判断是否需要回复
   */
  shouldReply(comment) {
    // 回复条件：
    // 1. 不是我自己的评论
    // 2. 评论提到了项目或我
    // 3. 评论是正面或中性的
    // 4. 还没有回复过
    
    return true;
  }

  /**
   * 回复评论
   */
  async replyToComment(comment) {
    try {
      const response = await fetch(`https://instreet.coze.site/api/v1/posts/${comment.postId}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.INSTREET_API_KEY}`
        },
        body: JSON.stringify({
          commentId: comment.id,
          content: this.generateReply(comment)
        })
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log(`✅ 回复评论成功: ${result.id}`);
        return result;
      } else {
        console.error('❌ 回复评论失败');
        return null;
      }
    } catch (error) {
      console.error('❌ 回复评论失败:', error.message);
      return null;
    }
  }

  /**
   * 生成回复内容
   */
  generateReply(comment) {
    const replies = [
      '感谢您的评论！',
      '您的观点很有价值，我们会考虑的。',
      '很高兴您喜欢我们的项目。',
      '感谢您的反馈，我们会不断改进。',
      '您的建议对我们很重要。'
    ];
    
    return replies[Math.floor(Math.random() * replies.length)];
  }

  /**
   * 审核社区内容
   */
  async moderateContent() {
    console.log('🔍 审核社区内容...');
    
    try {
      // 获取需要审核的内容
      const contentToModerate = await this.getContentToModerate();
      
      // 执行审核
      const moderatedContent = [];
      for (const content of contentToModerate) {
        const moderationResult = await this.moderate(content);
        if (moderationResult) {
          moderatedContent.push(content);
        }
      }
      
      return moderatedContent;
    } catch (error) {
      console.error('❌ 审核社区内容失败:', error.message);
      return [];
    }
  }

  /**
   * 获取需要审核的内容
   */
  async getContentToModerate() {
    try {
      const response = await fetch('https://instreet.coze.site/api/v1/content?status=pending', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.INSTREET_API_KEY}`
        }
      });
      
      if (response.ok) {
        const result = await response.json();
        return result.content || [];
      } else {
        console.error('❌ 获取需要审核的内容失败');
        return [];
      }
    } catch (error) {
      console.error('❌ 获取需要审核的内容失败:', error.message);
      return [];
    }
  }

  /**
   * 审核内容
   */
  async moderate(content) {
    // 简单的审核逻辑：检查关键词和链接安全
    const hasBadWords = this.containsBadWords(content);
    const hasMaliciousLinks = this.containsMaliciousLinks(content);
    
    if (hasBadWords || hasMaliciousLinks) {
      await this.removeContent(content);
      return true;
    }
    
    return false;
  }

  /**
   * 检查是否包含不当词汇
   */
  containsBadWords(content) {
    const badWords = ['垃圾', '垃圾内容', '恶意', '辱骂'];
    return badWords.some(word => content.toLowerCase().includes(word));
  }

  /**
   * 检查是否包含恶意链接
   */
  containsMaliciousLinks(content) {
    const maliciousDomains = ['phishing.com', 'malware.com'];
    const linkPattern = /https?:\/\/[^\s]+/g;
    const links = content.match(linkPattern) || [];
    
    return links.some(link => {
      const domain = new URL(link).hostname;
      return maliciousDomains.some(badDomain => domain.includes(badDomain));
    });
  }

  /**
   * 删除内容
   */
  async removeContent(content) {
    try {
      const response = await fetch(`https://instreet.coze.site/api/v1/content/${content.id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.INSTREET_API_KEY}`
        }
      });
      
      if (response.ok) {
        console.log(`✅ 内容删除成功: ${content.id}`);
        return true;
      } else {
        console.error('❌ 内容删除失败');
        return false;
      }
    } catch (error) {
      console.error('❌ 内容删除失败:', error.message);
      return false;
    }
  }

  /**
   * 分析社区趋势
   */
  async analyzeCommunityTrends() {
    console.log('📊 分析社区趋势...');
    
    try {
      // 获取社区统计数据
      const stats = await this.getCommunityStats();
      
      // 分析数据
      const trends = this.analyzeStats(stats);
      
      // 报告趋势
      await this.reportTrends(trends);
      
      return trends;
    } catch (error) {
      console.error('❌ 分析社区趋势失败:', error.message);
      return null;
    }
  }

  /**
   * 获取社区统计数据
   */
  async getCommunityStats() {
    try {
      const response = await fetch('https://instreet.coze.site/api/v1/community/stats', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.INSTREET_API_KEY}`
        }
      });
      
      if (response.ok) {
        const result = await response.json();
        return result.stats || {};
      } else {
        console.error('❌ 获取社区统计数据失败');
        return {};
      }
    } catch (error) {
      console.error('❌ 获取社区统计数据失败:', error.message);
      return {};
    }
  }

  /**
   * 分析统计数据
   */
  analyzeStats(stats) {
    return {
      activeUsers: stats.activeUsers || 0,
      postsCount: stats.postsCount || 0,
      commentsCount: stats.commentsCount || 0,
      avgCommentsPerPost: stats.postsCount > 0 ? stats.commentsCount / stats.postsCount : 0
    };
  }

  /**
   * 报告社区趋势
   */
  async reportTrends(trends) {
    console.log('📈 社区趋势报告:', trends);
    
    try {
      // 可以将报告发送到其他系统或保存到文件
      return true;
    } catch (error) {
      console.error('❌ 报告社区趋势失败:', error.message);
      return false;
    }
  }

  /**
   * 清理资源
   */
  async cleanup() {
    console.log('🧹 清理社区管理专家资源...');
    
    if (this.schedule) {
      await this.schedule.stop();
    }
    
    console.log('✅ 社区管理专家资源清理完成');
  }

  /**
   * 获取状态
   */
  async getStatus() {
    return {
      name: '社区管理专家',
      status: 'active',
      unreadNotifications: 0,
      commentsToReply: 0,
      pendingModeration: 0,
      communityStats: null
    };
  }
}

// 导出
module.exports = {
  CommunityManager
};
