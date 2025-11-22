/**
 * Readiness Check Routes
 * Checks if the service is ready to accept traffic
 */

import { analyzerClient } from '../grpc-client.js';
import { redisClient } from '../redis-client.js';

/**
 * Readiness check route
 * Verifies that all dependencies are available
 */
export default async function readyRoutes(fastify, options) {
  /**
   * GET /ready
   * Readiness check - verifies dependencies are available
   * Returns 200 if ready, 503 if not ready
   */
  fastify.get('/ready', {
    schema: {
      description: 'Readiness check endpoint',
      tags: ['monitoring'],
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            checks: {
              type: 'object',
              properties: {
                analyzer: { type: 'boolean' },
                redis: { type: 'boolean' },
                postgres: { type: 'boolean' },
              },
            },
            timestamp: { type: 'string' },
          },
        },
        503: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            checks: { type: 'object' },
            timestamp: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const checks = {
      analyzer: false,
      redis: false,
      postgres: false,
    };

    // Check Analyzer service (gRPC connection)
    try {
      const healthResult = await analyzerClient.healthCheck();
      checks.analyzer = healthResult && healthResult.status === 1; // 1 = SERVING
    } catch (error) {
      fastify.log.warn('Analyzer health check failed:', error.message);
      checks.analyzer = false;
    }

    // Check Redis connection
    try {
      checks.redis = await redisClient.healthCheck();
    } catch (error) {
      fastify.log.warn('Redis health check failed:', error.message);
      checks.redis = false;
    }

    // Check PostgreSQL connection
    // TODO: Implement actual PostgreSQL health check in Phase 3.2
    // For now, assume it's available if configured
    checks.postgres = true; // Mock: Always true until Phase 3.2

    // Determine overall readiness
    const isReady = Object.values(checks).every(check => check === true);

    if (!isReady) {
      reply.status(503);
      return {
        status: 'not_ready',
        checks,
        timestamp: new Date().toISOString(),
        message: 'Service dependencies are not ready',
      };
    }

    return {
      status: 'ready',
      checks,
      timestamp: new Date().toISOString(),
    };
  });
}
