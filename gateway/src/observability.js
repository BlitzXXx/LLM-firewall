/**
 * Observability Module
 * OpenTelemetry instrumentation with Prometheus metrics and Jaeger tracing
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { FastifyInstrumentation } from '@opentelemetry/instrumentation-fastify';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { RedisInstrumentation } from '@opentelemetry/instrumentation-redis-4';
import { GrpcInstrumentation } from '@opentelemetry/instrumentation-grpc';
import { MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { gatewayConfig } from './config.js';
import { logger } from './logger.js';

/**
 * Custom metrics for LLM Firewall
 */
let metricsCollector = null;

/**
 * Initialize OpenTelemetry SDK
 * @returns {NodeSDK|null} Initialized SDK or null if disabled
 */
export function initializeObservability() {
  if (!gatewayConfig.observability.enabled) {
    logger.info('OpenTelemetry disabled');
    return null;
  }

  try {
    // Configure Prometheus exporter for metrics
    const prometheusExporter = new PrometheusExporter({
      port: gatewayConfig.observability.prometheus.port,
      endpoint: gatewayConfig.observability.prometheus.metricsEndpoint,
    });

    // Configure resource (service identification)
    const resource = new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: gatewayConfig.observability.serviceName,
      [SemanticResourceAttributes.SERVICE_VERSION]: gatewayConfig.observability.serviceVersion,
      [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: gatewayConfig.env,
    });

    // Configure instrumentations
    const instrumentations = [
      new HttpInstrumentation(),
      new FastifyInstrumentation(),
      new PgInstrumentation(),
      new RedisInstrumentation(),
      new GrpcInstrumentation(),
    ];

    // Configure SDK options
    const sdkOptions = {
      resource,
      instrumentations,
      metricReader: new PeriodicExportingMetricReader({
        exporter: prometheusExporter,
        exportIntervalMillis: 10000, // Export every 10 seconds
      }),
    };

    // Add Jaeger exporter if enabled
    if (gatewayConfig.observability.jaeger.enabled) {
      const jaegerExporter = new JaegerExporter({
        endpoint: `http://${gatewayConfig.observability.jaeger.agentHost}:${gatewayConfig.observability.jaeger.agentPort}/api/traces`,
      });
      sdkOptions.traceExporter = jaegerExporter;
    }

    // Create and start SDK
    const sdk = new NodeSDK(sdkOptions);

    sdk.start();

    logger.info('OpenTelemetry initialized', {
      service: gatewayConfig.observability.serviceName,
      version: gatewayConfig.observability.serviceVersion,
      prometheusPort: gatewayConfig.observability.prometheus.port,
      jaegerEnabled: gatewayConfig.observability.jaeger.enabled,
    });

    // Initialize custom metrics
    initializeCustomMetrics();

    // Handle graceful shutdown
    process.on('SIGTERM', () => {
      sdk.shutdown()
        .then(() => logger.info('OpenTelemetry shut down successfully'))
        .catch((error) => logger.error('Error shutting down OpenTelemetry', { error }));
    });

    return sdk;

  } catch (error) {
    logger.error('Failed to initialize OpenTelemetry', { error: error.message });
    return null;
  }
}

/**
 * Initialize custom metrics for LLM Firewall
 */
function initializeCustomMetrics() {
  const { MeterProvider } = require('@opentelemetry/sdk-metrics');
  const { PrometheusExporter } = require('@opentelemetry/exporter-prometheus');

  const prometheusExporter = new PrometheusExporter({
    port: gatewayConfig.observability.prometheus.port,
  });

  const meterProvider = new MeterProvider({
    readers: [prometheusExporter],
  });

  const meter = meterProvider.getMeter(gatewayConfig.observability.serviceName);

  // Custom metrics
  metricsCollector = {
    // Counter: Total requests
    requestsTotal: meter.createCounter('firewall_requests_total', {
      description: 'Total number of requests processed by the firewall',
    }),

    // Counter: Blocked requests
    blockedTotal: meter.createCounter('firewall_blocked_total', {
      description: 'Total number of requests blocked by the firewall',
    }),

    // Histogram: Request latency
    latency: meter.createHistogram('firewall_latency_seconds', {
      description: 'Request latency in seconds',
      unit: 'seconds',
    }),

    // Counter: PII detections
    piiDetections: meter.createCounter('firewall_pii_detections_total', {
      description: 'Total number of PII detections',
    }),

    // Counter: Prompt injection detections
    promptInjections: meter.createCounter('firewall_prompt_injections_total', {
      description: 'Total number of prompt injection attempts detected',
    }),

    // Counter: Rate limit violations
    rateLimitViolations: meter.createCounter('firewall_rate_limit_violations_total', {
      description: 'Total number of rate limit violations',
    }),

    // Gauge: Queue size (audit logs)
    auditQueueSize: meter.createObservableGauge('firewall_audit_queue_size', {
      description: 'Current size of audit log queue',
    }),

    // Counter: Requests by status code
    requestsByStatus: meter.createCounter('firewall_requests_by_status_total', {
      description: 'Total requests by HTTP status code',
    }),
  };

  logger.info('Custom metrics initialized');
}

/**
 * Record a request metric
 * @param {Object} options - Metric options
 */
export function recordRequest(options = {}) {
  if (!metricsCollector) return;

  const {
    path = '/',
    method = 'GET',
    status = 200,
    latencyMs = 0,
    isBlocked = false,
    blockReason = null,
  } = options;

  try {
    // Record total requests
    metricsCollector.requestsTotal.add(1, {
      path,
      method,
      status: status.toString(),
    });

    // Record blocked requests
    if (isBlocked) {
      metricsCollector.blockedTotal.add(1, {
        reason: blockReason || 'unknown',
        path,
      });
    }

    // Record latency
    metricsCollector.latency.record(latencyMs / 1000, {
      path,
      method,
    });

    // Record requests by status
    metricsCollector.requestsByStatus.add(1, {
      status: status.toString(),
      path,
    });

  } catch (error) {
    logger.error('Failed to record request metrics', { error: error.message });
  }
}

/**
 * Record PII detection metric
 * @param {number} count - Number of PII entities detected
 * @param {Array} types - Types of PII detected
 */
export function recordPiiDetection(count, types = []) {
  if (!metricsCollector || count === 0) return;

  try {
    types.forEach(type => {
      metricsCollector.piiDetections.add(count, {
        type: type || 'unknown',
      });
    });
  } catch (error) {
    logger.error('Failed to record PII detection metrics', { error: error.message });
  }
}

/**
 * Record prompt injection detection metric
 * @param {number} count - Number of injections detected
 * @param {Array} categories - Categories of injections
 */
export function recordPromptInjection(count, categories = []) {
  if (!metricsCollector || count === 0) return;

  try {
    categories.forEach(category => {
      metricsCollector.promptInjections.add(count, {
        category: category || 'unknown',
      });
    });
  } catch (error) {
    logger.error('Failed to record prompt injection metrics', { error: error.message });
  }
}

/**
 * Record rate limit violation metric
 * @param {string} limitType - Type of limit (global, ip, apikey)
 */
export function recordRateLimitViolation(limitType = 'unknown') {
  if (!metricsCollector) return;

  try {
    metricsCollector.rateLimitViolations.add(1, {
      type: limitType,
    });
  } catch (error) {
    logger.error('Failed to record rate limit violation metrics', { error: error.message });
  }
}

/**
 * Get metrics collector for custom recording
 * @returns {Object|null} Metrics collector or null
 */
export function getMetricsCollector() {
  return metricsCollector;
}

export default {
  initializeObservability,
  recordRequest,
  recordPiiDetection,
  recordPromptInjection,
  recordRateLimitViolation,
  getMetricsCollector,
};
