/**
 * Health Check Routes
 * Provides basic health and readiness endpoints
 */

/**
 * Health check route
 * Returns 200 OK if the service is running
 */
export default async function healthRoutes(fastify, options) {
  /**
   * GET /health
   * Basic health check - always returns 200 if server is up
   */
  fastify.get('/health', {
    schema: {
      description: 'Health check endpoint',
      tags: ['monitoring'],
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            service: { type: 'string' },
            version: { type: 'string' },
            timestamp: { type: 'string' },
            uptime: { type: 'number' },
          },
        },
      },
    },
  }, async (request, reply) => {
    return {
      status: 'ok',
      service: fastify.config.observability.serviceName,
      version: fastify.config.observability.serviceVersion,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  });
}
