/**
 * Metrics Plugin
 * Fastify plugin for automatic metrics collection
 */

import fp from 'fastify-plugin';
import { recordRequest } from '../observability.js';
import { logger } from '../logger.js';

/**
 * Metrics plugin
 * Automatically records metrics for all requests
 *
 * @param {Object} fastify - Fastify instance
 * @param {Object} options - Plugin options
 */
async function metricsPlugin(fastify, options) {
  const { enabled = true } = options;

  if (!enabled) {
    logger.info('Metrics plugin disabled');
    return;
  }

  /**
   * Metrics recording hook
   * Runs after response is sent
   */
  fastify.addHook('onResponse', async (request, reply) => {
    try {
      const latencyMs = Date.now() - request.startTime;
      const isBlocked = request.auditContext?.is_blocked || false;
      const blockReason = request.auditContext?.block_reason || null;

      // Record request metrics
      recordRequest({
        path: request.routeOptions?.url || request.url,
        method: request.method,
        status: reply.statusCode,
        latencyMs,
        isBlocked,
        blockReason,
      });

    } catch (error) {
      // Don't fail the request if metrics recording fails
      logger.error('Metrics recording failed', {
        requestId: request.id,
        error: error.message,
      });
    }
  });

  logger.info('Metrics plugin registered');
}

export default fp(metricsPlugin, {
  name: 'metrics',
  fastify: '4.x',
});
