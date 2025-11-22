/**
 * Request ID Plugin
 * Generates and propagates unique request IDs for tracing
 */

import { randomUUID } from 'crypto';
import fp from 'fastify-plugin';

/**
 * Request ID Plugin
 * Adds a unique ID to each request for distributed tracing
 */
async function requestIdPlugin(fastify, options) {
  const {
    headerName = 'x-request-id',
    generator = () => randomUUID(),
  } = options;

  // Add hook to generate request ID before route handling
  fastify.addHook('onRequest', async (request, reply) => {
    // Check if request already has an ID from upstream
    let requestId = request.headers[headerName];

    // Generate new ID if not present
    if (!requestId) {
      requestId = generator();
    }

    // Store request ID in request object
    request.id = requestId;

    // Add request ID to response headers for tracing
    reply.header(headerName, requestId);
  });

  // Decorate request with helper to get request ID
  fastify.decorateRequest('getRequestId', function () {
    return this.id;
  });
}

export default fp(requestIdPlugin, {
  name: 'request-id',
  fastify: '4.x',
});
