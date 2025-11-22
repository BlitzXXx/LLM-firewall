/**
 * Rate Limiting Plugin
 * Fastify plugin for request rate limiting using Redis Token Bucket algorithm
 */

import fp from 'fastify-plugin';
import { rateLimiter } from '../rate-limiter.js';
import { logger, logSecurityEvent } from '../logger.js';
import { recordRateLimitViolation } from '../observability.js';

/**
 * Rate limiting plugin
 * Adds rate limiting to all routes with X-RateLimit-* headers
 *
 * @param {Object} fastify - Fastify instance
 * @param {Object} options - Plugin options
 */
async function rateLimitPlugin(fastify, options) {
  const { enabled = true } = options;

  if (!enabled) {
    logger.info('Rate limiting plugin disabled');
    return;
  }

  /**
   * Extract API key from request
   * Supports multiple header formats
   *
   * @param {Object} request - Fastify request
   * @returns {string|null} API key or null
   */
  function extractApiKey(request) {
    // Check Authorization header (Bearer token)
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    // Check X-API-Key header
    const apiKeyHeader = request.headers['x-api-key'];
    if (apiKeyHeader) {
      return apiKeyHeader;
    }

    return null;
  }

  /**
   * Add rate limit headers to response
   *
   * @param {Object} reply - Fastify reply
   * @param {Object} rateLimit - Rate limit result
   */
  function addRateLimitHeaders(reply, rateLimit) {
    if (rateLimit.limit !== null) {
      reply.header('X-RateLimit-Limit', rateLimit.limit);
    }
    if (rateLimit.remaining !== null) {
      reply.header('X-RateLimit-Remaining', rateLimit.remaining);
    }
    if (rateLimit.reset !== null) {
      reply.header('X-RateLimit-Reset', rateLimit.reset);
    }
  }

  /**
   * Rate limiting hook
   * Runs before request handler
   */
  fastify.addHook('onRequest', async (request, reply) => {
    // Skip rate limiting for health check endpoints
    if (request.url === '/health' || request.url === '/ready') {
      return;
    }

    const ip = request.ip;
    const apiKey = extractApiKey(request);

    try {
      // Check rate limit
      const rateLimit = await rateLimiter.checkLimit({ ip, apiKey });

      // Add rate limit headers
      addRateLimitHeaders(reply, rateLimit);

      // Check if rate limited
      if (!rateLimit.allowed) {
        // Log security event
        logSecurityEvent(
          'RATE_LIMIT_EXCEEDED',
          {
            requestId: request.id,
            ip,
            type: rateLimit.type,
            limit: rateLimit.limit,
            retryAfter: rateLimit.retryAfter,
          },
          request
        );

        // Record rate limit violation metric
        recordRateLimitViolation(rateLimit.type);

        // Add Retry-After header
        if (rateLimit.retryAfter) {
          reply.header('Retry-After', rateLimit.retryAfter);
        }

        // Return 429 Too Many Requests
        reply.status(429);
        return reply.send({
          error: {
            type: 'RateLimitExceeded',
            message: 'Too many requests. Please try again later.',
            requestId: request.id,
            timestamp: new Date().toISOString(),
            details: {
              limit: rateLimit.limit,
              reset: rateLimit.reset,
              retryAfter: rateLimit.retryAfter,
            },
          },
        });
      }

      // Request allowed - log if approaching limit (>80%)
      if (rateLimit.remaining !== null && rateLimit.limit !== null) {
        const usagePercent = ((rateLimit.limit - rateLimit.remaining) / rateLimit.limit) * 100;
        if (usagePercent >= 80) {
          logger.warn('Rate limit approaching threshold', {
            requestId: request.id,
            ip,
            type: rateLimit.type,
            remaining: rateLimit.remaining,
            limit: rateLimit.limit,
            usagePercent: usagePercent.toFixed(1),
          });
        }
      }

    } catch (error) {
      // Log error but don't block request (fail open)
      logger.error('Rate limiting check failed, allowing request', {
        requestId: request.id,
        ip,
        error: error.message,
      });
    }
  });

  // Decorate fastify instance with rate limiter
  fastify.decorate('rateLimiter', rateLimiter);

  logger.info('Rate limiting plugin registered');
}

export default fp(rateLimitPlugin, {
  name: 'rate-limit',
  fastify: '4.x',
});
