/**
 * Audit Logging Service
 * GDPR-compliant async audit logging with PII hashing
 */

import { createHash } from 'crypto';
import { pgClient } from './pg-client.js';
import { gatewayConfig } from './config.js';
import { logger, logError } from './logger.js';

/**
 * Audit Logger Class
 * Provides GDPR-compliant audit logging with async processing
 */
class AuditLogger {
  constructor() {
    this.enabled = gatewayConfig.features.auditLogging;
    this.async = gatewayConfig.auditLog.async;
    this.queue = [];
    this.processing = false;
    this.maxQueueSize = 1000;

    if (this.enabled && this.async) {
      // Start async processing
      this.startProcessing();
    }

    logger.info('Audit Logger initialized', {
      enabled: this.enabled,
      async: this.async,
    });
  }

  /**
   * Hash data using SHA-256 for GDPR compliance
   * @private
   * @param {string} data - Data to hash
   * @returns {string} SHA-256 hash
   */
  _hash(data) {
    if (!data) return null;
    return createHash('sha256').update(data).digest('hex');
  }

  /**
   * Extract API key from request
   * @private
   * @param {Object} request - Fastify request
   * @returns {string|null} API key or null
   */
  _extractApiKey(request) {
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
   * Create audit log entry
   * @param {Object} request - Fastify request
   * @param {Object} reply - Fastify reply
   * @param {Object} [options] - Additional options
   * @returns {Promise<void>}
   */
  async log(request, reply, options = {}) {
    if (!this.enabled) {
      return;
    }

    try {
      // Calculate response size (estimate from serialized data)
      let responseSizeBytes = null;
      if (reply.payload) {
        responseSizeBytes = Buffer.byteLength(JSON.stringify(reply.payload));
      }

      // Extract API key
      const apiKey = this._extractApiKey(request);

      // Build audit log entry
      const logEntry = {
        request_id: request.id,
        timestamp: new Date(),
        method: request.method,
        path: request.url,

        // GDPR: Hash PII
        client_ip_hash: this._hash(request.ip),
        user_agent_hash: this._hash(request.headers['user-agent'] || ''),
        api_key_hash: apiKey ? this._hash(apiKey) : null,

        // Request/Response metrics
        request_size_bytes: request.headers['content-length']
          ? parseInt(request.headers['content-length'], 10)
          : null,
        response_status: reply.statusCode,
        response_size_bytes: responseSizeBytes,
        response_time_ms: Date.now() - request.startTime,

        // Security information
        is_blocked: options.is_blocked || false,
        block_reason: options.block_reason || null,
        detected_issues_count: options.detected_issues_count || 0,
        security_confidence: options.security_confidence || null,

        // LLM provider information
        llm_provider: options.llm_provider || null,
        llm_model: options.llm_model || request.body?.model || null,

        // Metadata
        metadata: {
          user_agent_truncated: (request.headers['user-agent'] || '').substring(0, 100),
          request_path: request.routeOptions?.url || request.url,
          ...options.metadata,
        },
      };

      if (this.async) {
        // Add to async queue
        await this._queueLog(logEntry);
      } else {
        // Synchronous logging (blocks request)
        await pgClient.insertAuditLog(logEntry);
      }

    } catch (error) {
      // Don't fail the request if audit logging fails
      logError(error, {
        context: 'Audit logging',
        requestId: request.id,
      });
    }
  }

  /**
   * Add log entry to async queue
   * @private
   * @param {Object} logEntry - Log entry to queue
   */
  async _queueLog(logEntry) {
    if (this.queue.length >= this.maxQueueSize) {
      logger.warn('Audit log queue full, dropping log entry', {
        queueSize: this.queue.length,
        requestId: logEntry.request_id,
      });
      return;
    }

    this.queue.push(logEntry);

    logger.debug('Audit log queued', {
      queueSize: this.queue.length,
      requestId: logEntry.request_id,
    });
  }

  /**
   * Start async processing of queued logs
   * @private
   */
  startProcessing() {
    setInterval(async () => {
      await this._processQueue();
    }, 1000); // Process queue every second

    logger.info('Audit log async processing started');
  }

  /**
   * Process queued audit logs
   * @private
   */
  async _processQueue() {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    try {
      // Process in batches of 10
      const batchSize = 10;
      const batch = this.queue.splice(0, batchSize);

      logger.debug(`Processing ${batch.length} audit logs`, {
        remaining: this.queue.length,
      });

      // Insert all logs in parallel
      await Promise.all(
        batch.map(logEntry =>
          pgClient.insertAuditLog(logEntry).catch(error => {
            logError(error, {
              context: 'Batch audit log insert',
              requestId: logEntry.request_id,
            });
          })
        )
      );

      if (batch.length > 0) {
        logger.debug(`Processed ${batch.length} audit logs successfully`);
      }

    } catch (error) {
      logError(error, { context: 'Process audit log queue' });
    } finally {
      this.processing = false;
    }
  }

  /**
   * Flush all queued logs (for graceful shutdown)
   * @returns {Promise<void>}
   */
  async flush() {
    if (!this.async || this.queue.length === 0) {
      return;
    }

    logger.info(`Flushing ${this.queue.length} queued audit logs...`);

    while (this.queue.length > 0) {
      await this._processQueue();
      // Wait a bit before next batch
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    logger.info('Audit log queue flushed');
  }

  /**
   * Get queue size
   * @returns {number} Number of queued logs
   */
  getQueueSize() {
    return this.queue.length;
  }
}

// Create singleton instance
export const auditLogger = new AuditLogger();

export default auditLogger;
