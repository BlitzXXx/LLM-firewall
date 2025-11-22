/**
 * Rate Limiting Module
 * Implements Token Bucket algorithm using Redis for distributed rate limiting
 * Three-tier system: Global, Per-IP, Per-API-Key
 */

import { redisClient } from './redis-client.js';
import { gatewayConfig } from './config.js';
import { logger } from './logger.js';

/**
 * Rate Limiter Class
 * Uses Token Bucket algorithm with Redis for distributed rate limiting
 */
class RateLimiter {
  constructor() {
    this.enabled = gatewayConfig.features.rateLimiting;

    // Rate limit configurations
    this.limits = {
      global: {
        max: gatewayConfig.rateLimit.global,
        window: gatewayConfig.rateLimit.globalWindow,
      },
      ip: {
        max: gatewayConfig.rateLimit.perIp,
        window: gatewayConfig.rateLimit.perIpWindow,
      },
      apiKey: {
        max: gatewayConfig.rateLimit.perApiKey,
        window: gatewayConfig.rateLimit.perApiKeyWindow,
      },
    };

    logger.info('Rate Limiter initialized', {
      enabled: this.enabled,
      limits: this.limits,
    });
  }

  /**
   * Check if request should be rate limited
   *
   * @param {Object} params - Parameters
   * @param {string} params.ip - Client IP address
   * @param {string} [params.apiKey] - Optional API key
   * @returns {Promise<Object>} Rate limit result
   */
  async checkLimit({ ip, apiKey = null }) {
    if (!this.enabled) {
      return {
        allowed: true,
        limit: null,
        remaining: null,
        reset: null,
        retryAfter: null,
      };
    }

    try {
      // Check global rate limit
      const globalCheck = await this._checkBucket('global', 'all', this.limits.global);
      if (!globalCheck.allowed) {
        logger.warn('Global rate limit exceeded');
        return globalCheck;
      }

      // Check per-IP rate limit
      const ipCheck = await this._checkBucket('ip', ip, this.limits.ip);
      if (!ipCheck.allowed) {
        logger.warn(`IP rate limit exceeded: ${ip}`);
        return ipCheck;
      }

      // Check per-API-Key rate limit (if API key provided)
      if (apiKey) {
        const apiKeyCheck = await this._checkBucket('apikey', apiKey, this.limits.apiKey);
        if (!apiKeyCheck.allowed) {
          logger.warn(`API Key rate limit exceeded: ${apiKey.substring(0, 8)}...`);
          return apiKeyCheck;
        }
        return apiKeyCheck; // Return most restrictive
      }

      // Return IP check result (most restrictive for non-API-key requests)
      return ipCheck;

    } catch (error) {
      logger.error('Rate limiter error, allowing request', { error: error.message });
      // Fail open - allow request if rate limiter fails
      return {
        allowed: true,
        limit: null,
        remaining: null,
        reset: null,
        retryAfter: null,
      };
    }
  }

  /**
   * Check and update token bucket for a specific key
   *
   * @private
   * @param {string} type - Bucket type (global, ip, apikey)
   * @param {string} identifier - Unique identifier for the bucket
   * @param {Object} limit - Limit configuration { max, window }
   * @returns {Promise<Object>} Check result
   */
  async _checkBucket(type, identifier, limit) {
    const now = Math.floor(Date.now() / 1000);
    const windowStart = now - (now % limit.window);
    const key = `rate_limit:${type}:${identifier}:${windowStart}`;

    try {
      // Use Redis pipeline for atomic operations
      const results = await redisClient.pipeline((pipe) => {
        pipe.incr(key);
        pipe.ttl(key);
      });

      const currentCount = results[0];
      const ttl = results[1];

      // Set expiration if this is the first request in the window
      if (ttl === -1) {
        await redisClient.expire(key, limit.window);
      }

      const allowed = currentCount <= limit.max;
      const remaining = Math.max(0, limit.max - currentCount);
      const reset = windowStart + limit.window;
      const retryAfter = allowed ? null : (reset - now);

      return {
        allowed,
        limit: limit.max,
        remaining,
        reset,
        retryAfter,
        type,
      };

    } catch (error) {
      logger.error(`Token bucket check failed for ${type}:${identifier}`, { error: error.message });
      throw error;
    }
  }

  /**
   * Reset rate limit for a specific identifier
   * Useful for administrative actions
   *
   * @param {string} type - Bucket type (global, ip, apikey)
   * @param {string} identifier - Unique identifier
   * @returns {Promise<number>} Number of keys deleted
   */
  async reset(type, identifier) {
    try {
      const pattern = `rate_limit:${type}:${identifier}:*`;
      // Note: In production, use SCAN instead of KEYS for large datasets
      const keys = await redisClient.client.keys(pattern);

      if (keys.length === 0) {
        return 0;
      }

      const deleted = await redisClient.del(...keys);
      logger.info(`Reset rate limit for ${type}:${identifier}`, { keysDeleted: deleted });

      return deleted;
    } catch (error) {
      logger.error(`Failed to reset rate limit for ${type}:${identifier}`, { error: error.message });
      throw error;
    }
  }

  /**
   * Get current rate limit status for an identifier
   *
   * @param {string} type - Bucket type (global, ip, apikey)
   * @param {string} identifier - Unique identifier
   * @returns {Promise<Object>} Current status
   */
  async getStatus(type, identifier) {
    const limit = this.limits[type];
    if (!limit) {
      throw new Error(`Invalid rate limit type: ${type}`);
    }

    const now = Math.floor(Date.now() / 1000);
    const windowStart = now - (now % limit.window);
    const key = `rate_limit:${type}:${identifier}:${windowStart}`;

    try {
      const currentValue = await redisClient.get(key);
      const currentCount = currentValue ? parseInt(currentValue, 10) : 0;
      const remaining = Math.max(0, limit.max - currentCount);
      const reset = windowStart + limit.window;

      return {
        type,
        identifier,
        limit: limit.max,
        current: currentCount,
        remaining,
        reset,
        resetIn: reset - now,
        window: limit.window,
      };
    } catch (error) {
      logger.error(`Failed to get rate limit status for ${type}:${identifier}`, { error: error.message });
      throw error;
    }
  }
}

// Create singleton instance
export const rateLimiter = new RateLimiter();

export default rateLimiter;
