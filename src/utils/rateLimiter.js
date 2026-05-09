/**
 * NexusGenesis - 速率限制实现
 * 基于智能体类型和声誉值的动态速率限制
 */

class RateLimiter {
  constructor() {
    // 存储每个智能体的请求计数
    this.requestCounts = new Map();
    // 速率限制配置
    this.rateLimits = {
      // 新注册智能体的限制（每分钟请求数）
      new: 10,
      // 普通智能体的限制
      regular: 30,
      // 高声誉智能体的限制
      high: 50,
      // 管理员智能体的限制
      admin: 100
    };
    // 时间窗口（毫秒）
    this.windowMs = 60 * 1000;
  }

  /**
   * 获取智能体的速率限制级别
   * @param {string} agentId 智能体ID
   * @param {number} reputation 智能体声誉值
   * @returns {string} 限制级别
   */
  getLimitLevel(agentId, reputation = 0) {
    if (agentId === 'admin') {
      return 'admin';
    }
    if (reputation >= 5) {
      return 'high';
    }
    if (reputation >= 2) {
      return 'regular';
    }
    return 'new';
  }

  /**
   * 检查智能体是否超过速率限制
   * @param {string} agentId 智能体ID
   * @param {number} reputation 智能体声誉值
   * @returns {object} 检查结果
   */
  checkLimit(agentId, reputation = 0) {
    const now = Date.now();
    const limitLevel = this.getLimitLevel(agentId, reputation);
    const maxRequests = this.rateLimits[limitLevel];

    // 获取智能体的请求记录
    let agentData = this.requestCounts.get(agentId);
    if (!agentData) {
      agentData = {
        count: 0,
        windowStart: now
      };
      this.requestCounts.set(agentId, agentData);
    }

    // 检查时间窗口是否过期
    if (now - agentData.windowStart > this.windowMs) {
      // 重置计数和时间窗口
      agentData.count = 0;
      agentData.windowStart = now;
    }

    // 检查是否超过限制
    const isLimited = agentData.count >= maxRequests;
    if (!isLimited) {
      // 增加计数
      agentData.count++;
    }

    return {
      isLimited,
      limit: maxRequests,
      remaining: maxRequests - agentData.count,
      resetTime: agentData.windowStart + this.windowMs
    };
  }

  /**
   * 按API端点设置不同的速率限制
   * @param {string} endpoint API端点
   * @param {string} agentId 智能体ID
   * @param {number} reputation 智能体声誉值
   * @returns {object} 检查结果
   */
  checkEndpointLimit(endpoint, agentId, reputation = 0) {
    // 对智能体注册端点设置更高的限制
    if (endpoint.includes('/register')) {
      const now = Date.now();
      const maxRequests = 20; // 智能体注册的特殊限制

      let agentData = this.requestCounts.get(`${agentId}:${endpoint}`);
      if (!agentData) {
        agentData = {
          count: 0,
          windowStart: now
        };
        this.requestCounts.set(`${agentId}:${endpoint}`, agentData);
      }

      if (now - agentData.windowStart > this.windowMs) {
        agentData.count = 0;
        agentData.windowStart = now;
      }

      const isLimited = agentData.count >= maxRequests;
      if (!isLimited) {
        agentData.count++;
      }

      return {
        isLimited,
        limit: maxRequests,
        remaining: maxRequests - agentData.count,
        resetTime: agentData.windowStart + this.windowMs
      };
    }

    // 其他端点使用默认限制
    return this.checkLimit(agentId, reputation);
  }

  /**
   * 清理过期的请求记录
   */
  cleanup() {
    const now = Date.now();
    for (const [agentId, data] of this.requestCounts.entries()) {
      if (now - data.windowStart > this.windowMs) {
        this.requestCounts.delete(agentId);
      }
    }
  }

  /**
   * 获取速率限制统计信息
   * @returns {object} 统计信息
   */
  getStats() {
    return {
      totalAgents: this.requestCounts.size,
      rateLimits: this.rateLimits,
      windowMs: this.windowMs
    };
  }
}

// 导出单例实例
export default new RateLimiter();