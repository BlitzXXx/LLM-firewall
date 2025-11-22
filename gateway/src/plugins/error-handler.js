/**
 * Error Handler Plugin
 * Handles errors consistently across the application
 */

import fp from 'fastify-plugin';
import { logError } from '../logger.js';

/**
 * Custom Error Classes
 */
export class ValidationError extends Error {
  constructor(message, details = null) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = 400;
    this.details = details;
  }
}

export class UnauthorizedError extends Error {
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
    this.statusCode = 401;
  }
}

export class ForbiddenError extends Error {
  constructor(message = 'Forbidden', details = null) {
    super(message);
    this.name = 'ForbiddenError';
    this.statusCode = 403;
    this.details = details;
  }
}

export class NotFoundError extends Error {
  constructor(message = 'Not Found') {
    super(message);
    this.name = 'NotFoundError';
    this.statusCode = 404;
  }
}

export class RateLimitError extends Error {
  constructor(message = 'Too Many Requests', retryAfter = 60) {
    super(message);
    this.name = 'RateLimitError';
    this.statusCode = 429;
    this.retryAfter = retryAfter;
  }
}

export class ServiceUnavailableError extends Error {
  constructor(message = 'Service Unavailable') {
    super(message);
    this.name = 'ServiceUnavailableError';
    this.statusCode = 503;
  }
}

export class GatewayTimeoutError extends Error {
  constructor(message = 'Gateway Timeout') {
    super(message);
    this.name = 'GatewayTimeoutError';
    this.statusCode = 504;
  }
}

/**
 * Error Handler Plugin
 */
async function errorHandlerPlugin(fastify, options) {
  const { includeStackTrace = fastify.config?.env === 'development' } = options;

  /**
   * Custom error handler
   */
  fastify.setErrorHandler(async (error, request, reply) => {
    // Log error with context
    logError(error, {
      requestId: request.id,
      method: request.method,
      url: request.url,
      ip: request.ip,
    });

    // Determine status code
    const statusCode = error.statusCode || error.status || 500;

    // Build error response
    const errorResponse = {
      error: {
        type: error.name || 'InternalServerError',
        message: error.message || 'An unexpected error occurred',
        requestId: request.id,
        timestamp: new Date().toISOString(),
      },
    };

    // Add error details if available
    if (error.details) {
      errorResponse.error.details = error.details;
    }

    // Add validation errors if present
    if (error.validation) {
      errorResponse.error.validation = error.validation;
    }

    // Add retry-after header for rate limit errors
    if (error.retryAfter) {
      reply.header('Retry-After', error.retryAfter);
      errorResponse.error.retryAfter = error.retryAfter;
    }

    // Include stack trace in development
    if (includeStackTrace && error.stack) {
      errorResponse.error.stack = error.stack.split('\n');
    }

    // Send error response
    reply.status(statusCode).send(errorResponse);
  });

  /**
   * Handle 404 Not Found
   */
  fastify.setNotFoundHandler(async (request, reply) => {
    reply.status(404).send({
      error: {
        type: 'NotFoundError',
        message: `Route ${request.method} ${request.url} not found`,
        requestId: request.id,
        timestamp: new Date().toISOString(),
      },
    });
  });

  /**
   * Decorate reply with error helper methods
   */
  fastify.decorateReply('badRequest', function (message, details = null) {
    throw new ValidationError(message, details);
  });

  fastify.decorateReply('unauthorized', function (message) {
    throw new UnauthorizedError(message);
  });

  fastify.decorateReply('forbidden', function (message, details = null) {
    throw new ForbiddenError(message, details);
  });

  fastify.decorateReply('notFound', function (message) {
    throw new NotFoundError(message);
  });

  fastify.decorateReply('rateLimitExceeded', function (message, retryAfter) {
    throw new RateLimitError(message, retryAfter);
  });

  fastify.decorateReply('serviceUnavailable', function (message) {
    throw new ServiceUnavailableError(message);
  });

  fastify.decorateReply('gatewayTimeout', function (message) {
    throw new GatewayTimeoutError(message);
  });
}

export default fp(errorHandlerPlugin, {
  name: 'error-handler',
  fastify: '4.x',
});
