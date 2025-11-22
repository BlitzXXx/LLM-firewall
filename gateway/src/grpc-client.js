/**
 * gRPC Client for Analyzer Service
 * Handles communication with the Analyzer service with retry logic
 */

import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { gatewayConfig } from './config.js';
import { logger, logError } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load proto file
const PROTO_PATH = join(__dirname, '../../proto/firewall.proto');

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const firewallProto = grpc.loadPackageDefinition(packageDefinition).firewall;

/**
 * gRPC Client for Analyzer Service
 */
class AnalyzerClient {
  constructor() {
    this.client = null;
    this.connecting = false;
    this.connect();
  }

  /**
   * Connect to Analyzer service
   */
  connect() {
    if (this.client || this.connecting) {
      return;
    }

    this.connecting = true;
    const address = `${gatewayConfig.analyzer.host}:${gatewayConfig.analyzer.port}`;

    try {
      this.client = new firewallProto.FirewallService(
        address,
        grpc.credentials.createInsecure(),
        {
          'grpc.max_send_message_length': gatewayConfig.grpc.maxMessageSize,
          'grpc.max_receive_message_length': gatewayConfig.grpc.maxMessageSize,
          'grpc.keepalive_time_ms': gatewayConfig.grpc.keepaliveTime,
          'grpc.keepalive_timeout_ms': 5000,
        }
      );

      logger.info(`gRPC client connected to Analyzer at ${address}`);
    } catch (error) {
      logError(error, { context: 'gRPC client connection' });
      this.client = null;
    } finally {
      this.connecting = false;
    }
  }

  /**
   * Check content with retry logic
   *
   * @param {Object} params - Parameters
   * @param {string} params.content - Content to check
   * @param {string} params.requestId - Request ID
   * @param {Object} params.metadata - Additional metadata
   * @returns {Promise<Object>} Analysis results
   */
  async checkContent({ content, requestId, metadata = {} }) {
    const request = {
      content,
      request_id: requestId,
      metadata,
    };

    let lastError = null;
    const maxRetries = gatewayConfig.analyzer.maxRetries;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await this._makeRequest('CheckContent', request);
        return response;
      } catch (error) {
        lastError = error;

        // Don't retry on certain errors
        if (error.code === grpc.status.INVALID_ARGUMENT) {
          throw error;
        }

        // Log retry attempt
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
          logger.warn(
            `Analyzer request failed (attempt ${attempt + 1}/${maxRetries + 1}). ` +
            `Retrying in ${delay}ms... Error: ${error.message}`
          );
          await this._sleep(delay);

          // Reconnect if connection was lost
          if (
            error.code === grpc.status.UNAVAILABLE ||
            error.code === grpc.status.DEADLINE_EXCEEDED
          ) {
            this.client = null;
            this.connect();
          }
        }
      }
    }

    // All retries failed
    logger.error(
      `Analyzer request failed after ${maxRetries + 1} attempts`,
      { requestId, error: lastError }
    );
    throw lastError;
  }

  /**
   * Health check
   *
   * @param {string} service - Service name (optional)
   * @returns {Promise<Object>} Health status
   */
  async healthCheck(service = '') {
    try {
      const response = await this._makeRequest('HealthCheck', { service });
      return response;
    } catch (error) {
      logError(error, { context: 'Analyzer health check' });
      throw error;
    }
  }

  /**
   * Make gRPC request
   *
   * @private
   * @param {string} method - Method name
   * @param {Object} request - Request data
   * @returns {Promise<Object>} Response
   */
  _makeRequest(method, request) {
    return new Promise((resolve, reject) => {
      if (!this.client) {
        this.connect();
        if (!this.client) {
          return reject(new Error('gRPC client not connected'));
        }
      }

      const deadline = new Date();
      deadline.setMilliseconds(
        deadline.getMilliseconds() + gatewayConfig.analyzer.timeout
      );

      this.client[method](
        request,
        { deadline },
        (error, response) => {
          if (error) {
            return reject(error);
          }
          resolve(response);
        }
      );
    });
  }

  /**
   * Sleep utility
   *
   * @private
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Close connection
   */
  close() {
    if (this.client) {
      grpc.closeClient(this.client);
      this.client = null;
      logger.info('gRPC client closed');
    }
  }
}

// Create singleton instance
export const analyzerClient = new AnalyzerClient();

export default analyzerClient;
