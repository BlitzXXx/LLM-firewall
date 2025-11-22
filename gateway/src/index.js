/**
 * LLM Firewall Gateway Service
 * Main entry point for the Fastify server
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { gatewayConfig, validateConfig, getConfigSummary } from './config.js';
import { logger, logStartup, logShutdown } from './logger.js';
import requestIdPlugin from './plugins/request-id.js';
import errorHandlerPlugin from './plugins/error-handler.js';
import healthRoutes from './routes/health.js';
import readyRoutes from './routes/ready.js';
import chatRoutes from './routes/chat.js';

/**
 * Create and configure Fastify server
 */
async function createServer() {
  // Validate configuration before starting
  validateConfig();

  // Create Fastify instance
  const fastify = Fastify({
    logger: logger,
    disableRequestLogging: false,
    requestIdLogLabel: 'requestId',
    requestIdHeader: 'x-request-id',
    trustProxy: true, // Trust X-Forwarded-* headers
    bodyLimit: gatewayConfig.security.maxContentLength + 1024, // Add buffer for JSON overhead
  });

  // Decorate fastify with config for easy access
  fastify.decorate('config', gatewayConfig);

  // Register plugins

  // 1. Request ID generation (must be first)
  await fastify.register(requestIdPlugin);

  // 2. Security headers with Helmet
  if (gatewayConfig.helmet.enabled) {
    await fastify.register(helmet, {
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https:'],
        },
      },
      crossOriginEmbedderPolicy: false, // Disable for API usage
    });
  }

  // 3. CORS support
  if (gatewayConfig.cors.enabled) {
    await fastify.register(cors, {
      origin: gatewayConfig.cors.origin,
      methods: gatewayConfig.cors.methods,
      credentials: true,
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Request-ID',
        'X-API-Key',
      ],
      exposedHeaders: [
        'X-Request-ID',
        'X-RateLimit-Limit',
        'X-RateLimit-Remaining',
        'X-RateLimit-Reset',
        'Retry-After',
      ],
    });
  }

  // 4. Error handler (must be registered before routes)
  await fastify.register(errorHandlerPlugin, {
    includeStackTrace: gatewayConfig.env === 'development',
  });

  // Register routes
  await fastify.register(healthRoutes);
  await fastify.register(readyRoutes);
  await fastify.register(chatRoutes);

  // Add request timing hook
  fastify.addHook('onRequest', async (request, reply) => {
    request.startTime = Date.now();
  });

  // Add response timing hook
  fastify.addHook('onResponse', async (request, reply) => {
    const responseTime = Date.now() - request.startTime;
    reply.header('X-Response-Time', `${responseTime}ms`);
  });

  // Root endpoint
  fastify.get('/', {
    schema: {
      description: 'Root endpoint with service information',
      response: {
        200: {
          type: 'object',
          properties: {
            service: { type: 'string' },
            version: { type: 'string' },
            status: { type: 'string' },
            documentation: { type: 'string' },
            endpoints: {
              type: 'object',
              properties: {
                health: { type: 'string' },
                ready: { type: 'string' },
                chat: { type: 'string' },
                models: { type: 'string' },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    return {
      service: gatewayConfig.observability.serviceName,
      version: gatewayConfig.observability.serviceVersion,
      status: 'running',
      documentation: 'https://github.com/BlitzXXx/LLM-firewall',
      endpoints: {
        health: '/health',
        ready: '/ready',
        chat: '/v1/chat/completions',
        models: '/v1/models',
      },
    };
  });

  return fastify;
}

/**
 * Start the server
 */
async function start() {
  let server = null;

  try {
    // Create server
    server = await createServer();

    // Log startup information
    logStartup({
      serviceName: gatewayConfig.observability.serviceName,
      serviceVersion: gatewayConfig.observability.serviceVersion,
      environment: gatewayConfig.env,
      config: getConfigSummary(),
    });

    // Start listening
    const startTime = Date.now();
    await server.listen({
      port: gatewayConfig.port,
      host: gatewayConfig.host,
    });

    const startupTime = Date.now() - startTime;
    server.log.info(
      {
        startupTime,
        port: gatewayConfig.port,
        host: gatewayConfig.host,
      },
      `🚀 Gateway service started in ${startupTime}ms`
    );

    server.log.info(
      `📡 Listening on http://${gatewayConfig.host}:${gatewayConfig.port}`
    );

    // Log available routes
    const routes = server.printRoutes();
    server.log.debug({ routes }, 'Available routes');

  } catch (error) {
    logger.error({ err: error }, 'Failed to start server');
    process.exit(1);
  }

  // Graceful shutdown handling
  const signals = ['SIGINT', 'SIGTERM'];

  signals.forEach(signal => {
    process.on(signal, async () => {
      logShutdown(`Received ${signal}`);

      if (server) {
        try {
          // Set shutdown timeout
          const shutdownTimeout = setTimeout(() => {
            logger.error('Shutdown timeout exceeded, forcing exit');
            process.exit(1);
          }, gatewayConfig.shutdown.timeout);

          // Close server gracefully
          await server.close();

          clearTimeout(shutdownTimeout);
          logger.info('Server closed gracefully');
          process.exit(0);
        } catch (error) {
          logger.error({ err: error }, 'Error during shutdown');
          process.exit(1);
        }
      } else {
        process.exit(0);
      }
    });
  });

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    logger.error({ err: error }, 'Uncaught exception');
    process.exit(1);
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    logger.error(
      { reason, promise },
      'Unhandled promise rejection'
    );
    process.exit(1);
  });
}

// Start the server
start();
