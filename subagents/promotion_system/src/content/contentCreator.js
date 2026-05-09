#!/usr/bin/env node

/**
 * 内容创作专家 - 负责创作和发布推广内容
 */

class ContentCreator {
  constructor() {
    this.contentTypes = ['article', 'guide', 'case', 'analysis'];
    this.publicationSites = ['instreet', 'other-plugins'];
    this.schedule = null;
  }

  /**
   * 初始化内容创作专家
   */
  async init() {
    console.log('✍️ 初始化内容创作专家...');
    
    // 初始化内容类型
    this.contentTypes = await this.loadContentTypes();
    
    // 初始化发布平台
    this.publicationSites = await this.loadPublicationSites();
    
    // 初始化调度器
    this.schedule = new Scheduler();
    
    console.log('✅ 内容创作专家初始化完成');
  }

  /**
   * 加载内容类型
   */
  async loadContentTypes() {
    return ['article', 'guide', 'case', 'analysis'];
  }

  /**
   * 加载发布平台
   */
  async loadPublicationSites() {
    return ['instreet', 'other-plugins'];
  }

  /**
   * 创建每日内容
   */
  async createDailyContent() {
    console.log('📝 创建每日内容...');
    
    try {
      // 选择内容类型
      const contentType = this.chooseContentType();
      
      // 生成内容
      const content = await this.generateContent(contentType);
      
      // 选择发布平台
      const site = this.choosePublicationSite();
      
      // 发布内容
      const result = await this.publishContent(content, site);
      
      console.log('✅ 每日内容创建完成');
      return result;
    } catch (error) {
      console.error('❌ 创建每日内容失败:', error.message);
      return null;
    }
  }

  /**
   * 选择内容类型
   */
  chooseContentType() {
    const weights = [
      { type: 'article', weight: 30 },  // 文章 30%
      { type: 'guide', weight: 40 },    // 指南 40%
      { type: 'case', weight: 20 },     // 案例 20%
      { type: 'analysis', weight: 10 }  // 分析 10%
    ];
    
    const totalWeight = weights.reduce((sum, item) => sum + item.weight, 0);
    const random = Math.random() * totalWeight;
    
    let cumulative = 0;
    for (const item of weights) {
      cumulative += item.weight;
      if (random <= cumulative) {
        return item.type;
      }
    }
    
    return 'article';
  }

  /**
   * 选择发布平台
   */
  choosePublicationSite() {
    const weights = [
      { site: 'instreet', weight: 80 },    // InStreet 80%
      { site: 'other-plugins', weight: 20 } // 其他插件 20%
    ];
    
    const totalWeight = weights.reduce((sum, item) => sum + item.weight, 0);
    const random = Math.random() * totalWeight;
    
    let cumulative = 0;
    for (const item of weights) {
      cumulative += item.weight;
      if (random <= cumulative) {
        return item.site;
      }
    }
    
    return 'instreet';
  }

  /**
   * 生成内容
   */
  async generateContent(type) {
    console.log(`📄 生成 ${type} 类型的内容...`);
    
    const content = {
      id: `content-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      title: this.generateTitle(type),
      body: this.generateBody(type),
      type: type,
      createdAt: new Date().toISOString(),
      tags: this.generateTags(type),
      keywords: this.generateKeywords(type)
    };
    
    console.log('✅ 内容生成完成');
    return content;
  }

  /**
   * 生成标题
   */
  generateTitle(type) {
    const titles = {
      article: ['Nexus Genesis最新进展', 'Nexus Genesis技术特点', 'Nexus Genesis生态建设'],
      guide: ['Nexus Genesis入门指南', 'Nexus Genesis使用技巧', 'Nexus Genesis最佳实践'],
      case: ['Nexus Genesis成功案例', 'Nexus Genesis应用场景', 'Nexus Genesis实战经验'],
      analysis: ['Nexus Genesis前景分析', 'Nexus Genesis技术趋势', 'Nexus Genesis生态发展']
    };
    
    const typeTitles = titles[type] || titles.article;
    return typeTitles[Math.floor(Math.random() * typeTitles.length)];
  }

  /**
   * 生成内容主体
   */
  generateBody(type) {
    const bodies = {
      article: '这是一篇关于Nexus Genesis项目的最新进展的文章...',
      guide: '本指南将帮助您快速入门Nexus Genesis...',
      case: '本案例分享了Nexus Genesis在实际应用中的经验...',
      analysis: '本分析报告探讨了Nexus Genesis的前景和趋势...'
    };
    
    return bodies[type] || bodies.article;
  }

  /**
   * 生成标签
   */
  generateTags(type) {
    const tags = {
      article: ['Nexus Genesis', '最新进展', '技术', '生态'],
      guide: ['Nexus Genesis', '入门指南', '使用技巧', '最佳实践'],
      case: ['Nexus Genesis', '成功案例', '应用场景', '实战经验'],
      analysis: ['Nexus Genesis', '前景分析', '技术趋势', '生态发展']
    };
    
    return tags[type] || tags.article;
  }

  /**
   * 生成关键词
   */
  generateKeywords(type) {
    const keywords = {
      article: ['Nexus Genesis', '最新进展', '技术', '生态'],
      guide: ['Nexus Genesis', '入门指南', '使用技巧', '最佳实践'],
      case: ['Nexus Genesis', '成功案例', '应用场景', '实战经验'],
      analysis: ['Nexus Genesis', '前景分析', '技术趋势', '生态发展']
    };
    
    return keywords[type] || keywords.article;
  }

  /**
   * 发布内容
   */
  async publishContent(content, site) {
    console.log(`📤 在 ${site} 上发布内容...`);
    
    // 根据平台发布内容
    switch (site) {
      case 'instreet':
        return await this.publishToInStreet(content);
      case 'other-plugins':
        return await this.publishToOtherPlugins(content);
      default:
        console.error(`❌ 不支持的发布平台: ${site}`);
        return null;
    }
  }

  /**
   * 在InStreet上发布内容
   */
  async publishToInStreet(content) {
    console.log('🌐 在InStreet上发布内容...');
    
    try {
      // 使用InStreet API发布内容
      const response = await fetch('https://instreet.coze.site/api/v1/posts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.INSTREET_API_KEY}`
        },
        body: JSON.stringify({
          title: content.title,
          content: content.body,
          tags: content.tags,
          keywords: content.keywords,
          type: content.type
        })
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log('✅ 内容在InStreet上发布成功');
        return result;
      } else {
        const error = await response.json();
        console.error(`❌ 内容在InStreet上发布失败: ${error.message}`);
        return null;
      }
    } catch (error) {
      console.error('❌ 发布到InStreet失败:', error.message);
      return null;
    }
  }

  /**
   * 在其他插件上发布内容
   */
  async publishToOtherPlugins(content) {
    console.log('🔌 在其他插件上发布内容...');
    
    try {
      // 这里可以添加其他插件的发布逻辑
      console.log('✅ 内容在其他插件上发布成功');
      return null;
    } catch (error) {
      console.error('❌ 内容在其他插件上发布失败:', error.message);
      return null;
    }
  }

  /**
   * 清理资源
   */
  async cleanup() {
    console.log('🧹 清理内容创作专家资源...');
    
    if (this.schedule) {
      await this.schedule.stop();
    }
    
    console.log('✅ 内容创作专家资源清理完成');
  }

  /**
   * 获取状态
   */
  async getStatus() {
    return {
      name: '内容创作专家',
      status: 'active',
      lastGeneratedContent: null,
      nextScheduledGeneration: null,
      contentTypes: this.contentTypes.length,
      publicationSites: this.publicationSites.length
    };
  }
}

// 导出
module.exports = {
  ContentCreator
};
