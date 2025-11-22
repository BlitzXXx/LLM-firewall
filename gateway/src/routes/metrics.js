/**
 * Metrics Routes
 * Prometheus metrics endpoint
 */

import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';

// Store exporter reference
let prometheusExporter = null;

/**
 * Set Prometheus exporter instance
 * @param {PrometheusExporter} exporter - Prometheus exporter
 */
export function setPrometheusExporter(exporter) {
  prometheusExporter = exporter;
}

/**
 * Metrics routes
 * Provides Prometheus metrics endpoint
 */
export default async function metricsRoutes(fastify, options) {
  /**
   * GET /metrics
   * Prometheus metrics endpoint
   */
  fastify.get('/metrics', {
    schema: {
      description: 'Prometheus metrics endpoint',
      tags: ['observability'],
      response: {
        200: {
          type: 'string',
          description: 'Prometheus metrics in text format',
        },
      },
    },
  }, async (request, reply) => {
    try {
      // If we have a Prometheus exporter, use its metrics endpoint
      if (prometheusExporter) {
        const metrics = await prometheusExporter.getMetricsRequestHandler(
          request.raw,
          reply.raw
        );
        return;
      }

      // Fallback: Return basic metrics info
      reply.type('text/plain');
      return `# HELP firewall_info LLM Firewall service information
# TYPE firewall_info gauge
firewall_info{service="${fastify.config.observability.serviceName}",version="${fastify.config.observability.serviceVersion}",environment="${fastify.config.env}"} 1
`;
    } catch (error) {
      fastify.log.error('Failed to serve metrics', { error: error.message });
      reply.status(500);
      return 'Error serving metrics';
    }
  });
}
