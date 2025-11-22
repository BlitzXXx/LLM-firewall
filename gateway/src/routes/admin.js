/**
 * Admin Routes
 * Administrative endpoints for audit logs and statistics
 */

import { pgClient } from '../pg-client.js';

/**
 * Admin routes
 * Provides administrative access to audit logs and statistics
 */
export default async function adminRoutes(fastify, options) {
  /**
   * GET /admin/audit-logs
   * Query audit logs with filters
   */
  fastify.get('/admin/audit-logs', {
    schema: {
      description: 'Query audit logs',
      tags: ['admin'],
      querystring: {
        type: 'object',
        properties: {
          start_time: {
            type: 'string',
            format: 'date-time',
            description: 'Start time (ISO 8601)',
          },
          end_time: {
            type: 'string',
            format: 'date-time',
            description: 'End time (ISO 8601)',
          },
          client_ip_hash: {
            type: 'string',
            description: 'Client IP hash (SHA-256)',
          },
          is_blocked: {
            type: 'boolean',
            description: 'Filter by blocked status',
          },
          response_status: {
            type: 'integer',
            description: 'HTTP response status code',
          },
          limit: {
            type: 'integer',
            minimum: 1,
            maximum: 1000,
            default: 100,
            description: 'Maximum results to return',
          },
          offset: {
            type: 'integer',
            minimum: 0,
            default: 0,
            description: 'Offset for pagination',
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            logs: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'integer' },
                  request_id: { type: 'string' },
                  timestamp: { type: 'string', format: 'date-time' },
                  method: { type: 'string' },
                  path: { type: 'string' },
                  client_ip_hash: { type: 'string' },
                  response_status: { type: 'integer' },
                  response_time_ms: { type: 'integer' },
                  is_blocked: { type: 'boolean' },
                  block_reason: { type: 'string', nullable: true },
                },
              },
            },
            count: { type: 'integer' },
            limit: { type: 'integer' },
            offset: { type: 'integer' },
          },
        },
        500: {
          type: 'object',
          properties: {
            error: {
              type: 'object',
              properties: {
                type: { type: 'string' },
                message: { type: 'string' },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    try {
      const filters = {
        start_time: request.query.start_time ? new Date(request.query.start_time) : null,
        end_time: request.query.end_time ? new Date(request.query.end_time) : null,
        client_ip_hash: request.query.client_ip_hash || null,
        is_blocked: request.query.is_blocked,
        response_status: request.query.response_status || null,
        limit: request.query.limit || 100,
        offset: request.query.offset || 0,
      };

      const logs = await pgClient.queryAuditLogs(filters);

      return {
        logs,
        count: logs.length,
        limit: filters.limit,
        offset: filters.offset,
      };
    } catch (error) {
      fastify.log.error('Failed to query audit logs', { error: error.message });
      reply.status(500);
      return {
        error: {
          type: 'DatabaseError',
          message: 'Failed to query audit logs',
        },
      };
    }
  });

  /**
   * GET /admin/audit-stats
   * Get audit statistics
   */
  fastify.get('/admin/audit-stats', {
    schema: {
      description: 'Get audit statistics',
      tags: ['admin'],
      querystring: {
        type: 'object',
        properties: {
          start_time: {
            type: 'string',
            format: 'date-time',
            description: 'Start time (ISO 8601, default: 24h ago)',
          },
          end_time: {
            type: 'string',
            format: 'date-time',
            description: 'End time (ISO 8601, default: now)',
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            total_requests: { type: 'integer' },
            blocked_requests: { type: 'integer' },
            block_rate: { type: 'number' },
            avg_response_time_ms: { type: 'number' },
            unique_clients: { type: 'integer' },
            requests_by_status: { type: 'object' },
          },
        },
      },
    },
  }, async (request, reply) => {
    try {
      const startTime = request.query.start_time ? new Date(request.query.start_time) : null;
      const endTime = request.query.end_time ? new Date(request.query.end_time) : null;

      const stats = await pgClient.getAuditStats(startTime, endTime);

      return stats;
    } catch (error) {
      fastify.log.error('Failed to get audit stats', { error: error.message });
      reply.status(500);
      return {
        error: {
          type: 'DatabaseError',
          message: 'Failed to get audit statistics',
        },
      };
    }
  });

  /**
   * DELETE /admin/audit-logs/client/:ipHash
   * Delete audit logs for a client (GDPR right to deletion)
   */
  fastify.delete('/admin/audit-logs/client/:ipHash', {
    schema: {
      description: 'Delete audit logs for a client (GDPR)',
      tags: ['admin'],
      params: {
        type: 'object',
        required: ['ipHash'],
        properties: {
          ipHash: {
            type: 'string',
            description: 'Client IP hash (SHA-256)',
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            deleted_count: { type: 'integer' },
            client_ip_hash: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    try {
      const { ipHash } = request.params;
      const deletedCount = await pgClient.deleteClientAuditLogs(ipHash);

      return {
        deleted_count: deletedCount,
        client_ip_hash: ipHash,
      };
    } catch (error) {
      fastify.log.error('Failed to delete client audit logs', { error: error.message });
      reply.status(500);
      return {
        error: {
          type: 'DatabaseError',
          message: 'Failed to delete client audit logs',
        },
      };
    }
  });

  /**
   * POST /admin/audit-logs/cleanup
   * Cleanup expired audit logs (GDPR retention)
   */
  fastify.post('/admin/audit-logs/cleanup', {
    schema: {
      description: 'Cleanup expired audit logs',
      tags: ['admin'],
      response: {
        200: {
          type: 'object',
          properties: {
            deleted_count: { type: 'integer' },
            message: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    try {
      const deletedCount = await pgClient.cleanupExpiredLogs();

      return {
        deleted_count: deletedCount,
        message: `Cleaned up ${deletedCount} expired audit logs`,
      };
    } catch (error) {
      fastify.log.error('Failed to cleanup expired logs', { error: error.message });
      reply.status(500);
      return {
        error: {
          type: 'DatabaseError',
          message: 'Failed to cleanup expired logs',
        },
      };
    }
  });
}
