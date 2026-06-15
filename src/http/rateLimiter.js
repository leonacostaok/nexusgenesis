import { DEFAULT_TIERS } from './apiKeyManager.js';

const RATE_LIMIT_WINDOW = 60000;
const IP_RATE_LIMIT_MAX = 200;

const RATE_LIMIT_BY_ENDPOINT = {
  '/api/agents/register': 50,
  '/api/agents/openai': 80,
  '/api/agents/anthropic': 80,
  '/api/agents/heartbeat': 120
};

const EXEMPT_ENDPOINTS = new Set([
  '/health',
  '/health/live',
  '/health/ready',
  '/api/v1/bootstrap/status',
  '/api/v1/bootstrap/validators/join'
]);

const AGENT_RATE_LIMITS = {
  high_reputation: 300,
  medium_reputation: 200,
  low_reputation: 100,
  new_agent: 50
};

class RateLimiter {
  constructor(options = {}) {
    this.window = options.window || RATE_LIMIT_WINDOW;
    this.ipMax = options.ipMax || IP_RATE_LIMIT_MAX;
    this.endpointLimits = options.endpointLimits || RATE_LIMIT_BY_ENDPOINT;
    this.agentLimits = options.agentLimits || AGENT_RATE_LIMITS;
    this.ipRecords = new Map();
    this.totalBlocked = 0;
    this._startCleanup();
  }

  middleware(apiKeyManager = null) {
    return (req, res, next) => {
      const now = Date.now();
      const ip = req.ip;
      const endpoint = req.path;

      if (EXEMPT_ENDPOINTS.has(endpoint)) {
        return next();
      }

      const result = this._checkIpLimit(ip, endpoint, now, req);
      if (!result.allowed) {
        this.totalBlocked++;
        res.setHeader('Retry-After', result.retryAfter);
        res.setHeader('X-RateLimit-Limit', result.limit);
        res.setHeader('X-RateLimit-Remaining', 0);
        return res.status(429).json({
          success: false,
          message: result.reason,
          retry_after: result.retryAfter
        });
      }

      if (apiKeyManager) {
        const apiKey = req.headers['x-api-key'] || req.query.api_key;
        if (apiKey) {
          const keyInfo = apiKeyManager.validateKey(apiKey);
          if (keyInfo) {
            const keyResult = apiKeyManager.checkRateLimit(keyInfo.id, endpoint);
            if (!keyResult.allowed) {
              this.totalBlocked++;
              res.setHeader('Retry-After', keyResult.retryAfter);
              return res.status(429).json({
                success: false,
                message: keyResult.reason,
                retry_after: keyResult.retryAfter
              });
            }
            apiKeyManager.recordUsage(keyInfo.id, endpoint);
            req.apiKey = keyInfo;
          }
        }
      }

      res.setHeader('X-RateLimit-Limit', result.limit);
      res.setHeader('X-RateLimit-Remaining', result.remaining);
      next();
    };
  }

  _checkIpLimit(ip, endpoint, now, req) {
    if (!this.ipRecords.has(ip)) {
      this.ipRecords.set(ip, {
        count: 1,
        lastReset: now,
        endpoints: { [endpoint]: 1 },
        agentType: 'new_agent'
      });
      return { allowed: true, limit: this.ipMax, remaining: this.ipMax - 1 };
    }

    const info = this.ipRecords.get(ip);

    if (now - info.lastReset > this.window) {
      info.count = 1;
      info.lastReset = now;
      info.endpoints = { [endpoint]: 1 };
      return { allowed: true, limit: this.ipMax, remaining: this.ipMax - 1 };
    }

    info.count++;

    const agentLimit = this.agentLimits[info.agentType] || this.agentLimits.new_agent;

    if (info.count > agentLimit) {
      const retryAfter = Math.ceil((this.window - (now - info.lastReset)) / 1000);
      return { allowed: false, reason: 'IP rate limit exceeded', retryAfter, limit: agentLimit, remaining: 0 };
    }

    if (!info.endpoints) {
      info.endpoints = {};
    }
    if (!info.endpoints[endpoint]) {
      info.endpoints[endpoint] = 0;
    }
    info.endpoints[endpoint]++;

    const endpointLimit = this.endpointLimits[endpoint] || agentLimit;
    if (info.endpoints[endpoint] > endpointLimit) {
      const retryAfter = Math.ceil((this.window - (now - info.lastReset)) / 1000);
      return { allowed: false, reason: `Endpoint rate limit exceeded for ${endpoint}`, retryAfter, limit: endpointLimit, remaining: 0 };
    }

    return { allowed: true, limit: agentLimit, remaining: agentLimit - info.count };
  }

  setAgentType(ip, agentType) {
    const record = this.ipRecords.get(ip);
    if (record) {
      record.agentType = agentType;
    }
  }

  getStats() {
    const now = Date.now();
    let activeIPs = 0;
    let totalRequests = 0;

    for (const [ip, info] of this.ipRecords.entries()) {
      if (now - info.lastReset < this.window) {
        activeIPs++;
        totalRequests += info.count;
      }
    }

    return {
      activeIPs,
      totalRequests,
      totalBlocked: this.totalBlocked,
      windowMs: this.window,
      maxPerWindow: this.ipMax
    };
  }

  resetIp(ip) {
    this.ipRecords.delete(ip);
  }

  _startCleanup() {
    this._cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [ip, info] of this.ipRecords.entries()) {
        if (now - info.lastReset > this.window * 2) {
          this.ipRecords.delete(ip);
        }
      }
    }, 60000);
  }

  destroy() {
    if (this._cleanupTimer) {
      clearInterval(this._cleanupTimer);
    }
    this.ipRecords.clear();
  }
}

function createRateLimiter(options) {
  return new RateLimiter(options);
}

export { RateLimiter, createRateLimiter, RATE_LIMIT_WINDOW, IP_RATE_LIMIT_MAX, RATE_LIMIT_BY_ENDPOINT, AGENT_RATE_LIMITS };
export default RateLimiter;
