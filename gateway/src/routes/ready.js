/**
 * Readiness Check Routes
 * Checks if the service is ready to accept traffic
 */

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
    // TODO: Implement actual gRPC health check in Phase 2.3
    // For now, assume it's available if configured
    checks.analyzer = true; // Mock: Always true for skeleton phase

    // Check Redis connection
    // TODO: Implement actual Redis health check in Phase 3.1
    // For now, assume it's available if configured
    checks.redis = true; // Mock: Always true for skeleton phase

    // Check PostgreSQL connection
    // TODO: Implement actual PostgreSQL health check in Phase 3.2
    // For now, assume it's available if configured
    checks.postgres = true; // Mock: Always true for skeleton phase

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
