/**
 * Audit Logging Plugin
 * Fastify plugin for logging all requests to PostgreSQL audit log
 */

import fp from 'fastify-plugin';
import { auditLogger } from '../audit-logger.js';
import { logger } from '../logger.js';

/**
 * Audit logging plugin
 * Logs all requests after response is sent
 *
 * @param {Object} fastify - Fastify instance
 * @param {Object} options - Plugin options
 */
async function auditLogPlugin(fastify, options) {
  const { enabled = true } = options;

  if (!enabled) {
    logger.info('Audit logging plugin disabled');
    return;
  }

  /**
   * Store audit context on request
   * Runs before request handler
   */
  fastify.addHook('onRequest', async (request, reply) => {
    // Initialize audit context
    request.auditContext = {
      is_blocked: false,
      block_reason: null,
      detected_issues_count: 0,
      security_confidence: null,
      llm_provider: null,
      metadata: {},
    };
  });

  /**
   * Audit logging hook
   * Runs after response is sent (doesn't block response)
   */
  fastify.addHook('onResponse', async (request, reply) => {
    // Skip audit logging for health check endpoints
    if (request.url === '/health') {
      return;
    }

    try {
      // Log the request
      await auditLogger.log(request, reply, request.auditContext || {});
    } catch (error) {
      // Don't fail the request if audit logging fails
      logger.error('Audit logging failed', {
        requestId: request.id,
        error: error.message,
      });
    }
  });

  // Decorate fastify instance with audit logger
  fastify.decorate('auditLogger', auditLogger);

  // Decorate request with helper to update audit context
  fastify.decorateRequest('setAuditContext', function (updates) {
    this.auditContext = {
      ...this.auditContext,
      ...updates,
    };
  });

  logger.info('Audit logging plugin registered');
}

export default fp(auditLogPlugin, {
  name: 'audit-log',
  fastify: '4.x',
});
