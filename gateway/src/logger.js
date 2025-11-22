/**
 * Logger Module
 * Configures structured logging with Pino
 */

import pino from 'pino';
import { gatewayConfig } from './config.js';

/**
 * Create logger configuration
 */
function createLoggerConfig() {
  const baseConfig = {
    level: gatewayConfig.log.level,
    name: gatewayConfig.observability.serviceName,
    // Add service metadata to all logs
    base: {
      service: gatewayConfig.observability.serviceName,
      version: gatewayConfig.observability.serviceVersion,
      environment: gatewayConfig.env,
    },
    // Custom serializers for better log output
    serializers: {
      req: (req) => ({
        id: req.id,
        method: req.method,
        url: req.url,
        path: req.routeOptions?.url || req.url,
        headers: {
          host: req.headers.host,
          'user-agent': req.headers['user-agent'],
          'content-type': req.headers['content-type'],
        },
        remoteAddress: req.ip,
      }),
      res: (res) => ({
        statusCode: res.statusCode,
        headers: {
          'content-type': res.getHeader('content-type'),
        },
      }),
      err: pino.stdSerializers.err,
    },
    // Timestamp format
    timestamp: pino.stdTimeFunctions.isoTime,
  };

  // Use pretty printing in development
  if (gatewayConfig.log.pretty) {
    return {
      ...baseConfig,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss.l',
          ignore: 'pid,hostname',
          singleLine: false,
          messageFormat: '{levelLabel} - {msg}',
        },
      },
    };
  }

  return baseConfig;
}

/**
 * Create and export logger instance
 */
export const logger = pino(createLoggerConfig());

/**
 * Create child logger with additional context
 */
export function createChildLogger(context) {
  return logger.child(context);
}

/**
 * Log request start
 */
export function logRequestStart(req) {
  logger.info(
    {
      req,
      requestId: req.id,
      type: 'request_start',
    },
    `${req.method} ${req.url} - Request started`
  );
}

/**
 * Log request completion
 */
export function logRequestComplete(req, res, responseTime) {
  const logLevel = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';

  logger[logLevel](
    {
      req,
      res,
      requestId: req.id,
      responseTime,
      type: 'request_complete',
    },
    `${req.method} ${req.url} - ${res.statusCode} [${responseTime}ms]`
  );
}

/**
 * Log error
 */
export function logError(error, context = {}) {
  logger.error(
    {
      err: error,
      ...context,
      type: 'error',
    },
    error.message
  );
}

/**
 * Log security event
 */
export function logSecurityEvent(eventType, details, req = null) {
  logger.warn(
    {
      type: 'security_event',
      eventType,
      details,
      requestId: req?.id,
      ip: req?.ip,
    },
    `Security event: ${eventType}`
  );
}

/**
 * Log audit event
 */
export function logAuditEvent(action, details, req = null) {
  logger.info(
    {
      type: 'audit_event',
      action,
      details,
      requestId: req?.id,
      ip: req?.ip,
      timestamp: new Date().toISOString(),
    },
    `Audit: ${action}`
  );
}

/**
 * Log performance metric
 */
export function logPerformance(metric, value, unit = 'ms', context = {}) {
  logger.debug(
    {
      type: 'performance',
      metric,
      value,
      unit,
      ...context,
    },
    `Performance: ${metric} = ${value}${unit}`
  );
}

/**
 * Log startup information
 */
export function logStartup(config) {
  logger.info(
    {
      type: 'startup',
      config,
    },
    `Starting ${config.serviceName} v${config.serviceVersion} in ${config.environment} mode`
  );
}

/**
 * Log shutdown information
 */
export function logShutdown(reason) {
  logger.info(
    {
      type: 'shutdown',
      reason,
    },
    `Shutting down: ${reason}`
  );
}

export default logger;
