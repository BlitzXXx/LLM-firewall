/**
 * PostgreSQL Client Module
 * Manages PostgreSQL connection pool and provides query interface
 */

import pg from 'pg';
import { gatewayConfig } from './config.js';
import { logger, logError } from './logger.js';
import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * PostgreSQL Client Wrapper
 * Provides connection pooling and common database operations
 */
class PostgresClient {
  constructor() {
    this.pool = null;
    this.connected = false;
    this.connecting = false;
    this.connect();
  }

  /**
   * Connect to PostgreSQL with connection pooling
   */
  connect() {
    if (this.pool || this.connecting) {
      return;
    }

    this.connecting = true;

    try {
      this.pool = new Pool({
        host: gatewayConfig.postgres.host,
        port: gatewayConfig.postgres.port,
        database: gatewayConfig.postgres.database,
        user: gatewayConfig.postgres.user,
        password: gatewayConfig.postgres.password,
        max: 20, // Maximum number of clients in pool
        idleTimeoutMillis: 30000, // Close idle clients after 30s
        connectionTimeoutMillis: 5000, // Return error after 5s if unable to connect
      });

      this.pool.on('connect', () => {
        this.connected = true;
        this.connecting = false;
        logger.debug(`PostgreSQL client connected to ${gatewayConfig.postgres.host}:${gatewayConfig.postgres.port}`);
      });

      this.pool.on('error', (error) => {
        this.connected = false;
        logError(error, { context: 'PostgreSQL pool error' });
      });

      this.pool.on('remove', () => {
        logger.debug('PostgreSQL client removed from pool');
      });

      logger.info(`PostgreSQL connection pool created for ${gatewayConfig.postgres.database}`);

    } catch (error) {
      logError(error, { context: 'PostgreSQL pool initialization' });
      this.pool = null;
      this.connected = false;
      this.connecting = false;
    }
  }

  /**
   * Check if PostgreSQL is connected
   * @returns {boolean} True if connected
   */
  isConnected() {
    return this.connected && this.pool !== null;
  }

  /**
   * Health check - query database
   * @returns {Promise<boolean>} True if healthy
   */
  async healthCheck() {
    try {
      if (!this.pool) {
        return false;
      }
      const result = await this.pool.query('SELECT 1 AS health');
      return result.rows.length === 1 && result.rows[0].health === 1;
    } catch (error) {
      logError(error, { context: 'PostgreSQL health check' });
      return false;
    }
  }

  /**
   * Execute a query
   * @param {string} text - SQL query text
   * @param {Array} [params] - Query parameters
   * @returns {Promise<Object>} Query result
   */
  async query(text, params = []) {
    try {
      if (!this.pool) {
        throw new Error('PostgreSQL pool not initialized');
      }
      const start = Date.now();
      const result = await this.pool.query(text, params);
      const duration = Date.now() - start;

      logger.debug({
        query: text.substring(0, 100),
        duration,
        rows: result.rowCount,
      }, 'PostgreSQL query executed');

      return result;
    } catch (error) {
      logError(error, {
        context: 'PostgreSQL query',
        query: text.substring(0, 100),
      });
      throw error;
    }
  }

  /**
   * Execute multiple queries in a transaction
   * @param {Function} callback - Callback that receives client
   * @returns {Promise<any>} Transaction result
   */
  async transaction(callback) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      logError(error, { context: 'PostgreSQL transaction' });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Run database migrations
   * @returns {Promise<void>}
   */
  async runMigrations() {
    try {
      logger.info('Running database migrations...');

      // Read migration file
      const migrationPath = join(__dirname, '../migrations/001_create_audit_logs.sql');
      const migrationSQL = await readFile(migrationPath, 'utf-8');

      // Execute migration
      await this.query(migrationSQL);

      logger.info('Database migrations completed successfully');
    } catch (error) {
      logError(error, { context: 'Database migrations' });
      throw error;
    }
  }

  /**
   * Insert audit log entry
   * @param {Object} logEntry - Audit log data
   * @returns {Promise<Object>} Inserted row
   */
  async insertAuditLog(logEntry) {
    const query = `
      INSERT INTO audit_logs (
        request_id,
        timestamp,
        method,
        path,
        client_ip_hash,
        user_agent_hash,
        api_key_hash,
        request_size_bytes,
        response_status,
        response_size_bytes,
        response_time_ms,
        is_blocked,
        block_reason,
        detected_issues_count,
        security_confidence,
        llm_provider,
        llm_model,
        metadata
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
      ) RETURNING id
    `;

    const params = [
      logEntry.request_id,
      logEntry.timestamp || new Date(),
      logEntry.method,
      logEntry.path,
      logEntry.client_ip_hash,
      logEntry.user_agent_hash || null,
      logEntry.api_key_hash || null,
      logEntry.request_size_bytes || null,
      logEntry.response_status,
      logEntry.response_size_bytes || null,
      logEntry.response_time_ms,
      logEntry.is_blocked || false,
      logEntry.block_reason || null,
      logEntry.detected_issues_count || 0,
      logEntry.security_confidence || null,
      logEntry.llm_provider || null,
      logEntry.llm_model || null,
      logEntry.metadata ? JSON.stringify(logEntry.metadata) : null,
    ];

    try {
      const result = await this.query(query, params);
      return result.rows[0];
    } catch (error) {
      logError(error, {
        context: 'Insert audit log',
        request_id: logEntry.request_id,
      });
      throw error;
    }
  }

  /**
   * Query audit logs with filters
   * @param {Object} filters - Query filters
   * @returns {Promise<Array>} Audit log entries
   */
  async queryAuditLogs(filters = {}) {
    const {
      start_time,
      end_time,
      client_ip_hash,
      is_blocked,
      response_status,
      limit = 100,
      offset = 0,
    } = filters;

    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (start_time) {
      conditions.push(`timestamp >= $${paramIndex++}`);
      params.push(start_time);
    }

    if (end_time) {
      conditions.push(`timestamp <= $${paramIndex++}`);
      params.push(end_time);
    }

    if (client_ip_hash) {
      conditions.push(`client_ip_hash = $${paramIndex++}`);
      params.push(client_ip_hash);
    }

    if (is_blocked !== undefined) {
      conditions.push(`is_blocked = $${paramIndex++}`);
      params.push(is_blocked);
    }

    if (response_status) {
      conditions.push(`response_status = $${paramIndex++}`);
      params.push(response_status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const query = `
      SELECT *
      FROM audit_logs
      ${whereClause}
      ORDER BY timestamp DESC
      LIMIT $${paramIndex++}
      OFFSET $${paramIndex++}
    `;

    params.push(limit, offset);

    try {
      const result = await this.query(query, params);
      return result.rows;
    } catch (error) {
      logError(error, { context: 'Query audit logs', filters });
      throw error;
    }
  }

  /**
   * Delete audit logs for a client (GDPR right to deletion)
   * @param {string} clientIpHash - Hashed client IP
   * @returns {Promise<number>} Number of deleted rows
   */
  async deleteClientAuditLogs(clientIpHash) {
    try {
      const result = await this.query(
        'SELECT delete_audit_logs_by_client($1)',
        [clientIpHash]
      );
      const deletedCount = result.rows[0].delete_audit_logs_by_client;
      logger.info(`Deleted ${deletedCount} audit logs for client`, { clientIpHash });
      return deletedCount;
    } catch (error) {
      logError(error, {
        context: 'Delete client audit logs',
        clientIpHash,
      });
      throw error;
    }
  }

  /**
   * Cleanup expired audit logs (GDPR retention)
   * @returns {Promise<number>} Number of deleted rows
   */
  async cleanupExpiredLogs() {
    try {
      const result = await this.query('SELECT cleanup_expired_audit_logs()');
      const deletedCount = result.rows[0].cleanup_expired_audit_logs;
      logger.info(`Cleaned up ${deletedCount} expired audit logs`);
      return deletedCount;
    } catch (error) {
      logError(error, { context: 'Cleanup expired logs' });
      throw error;
    }
  }

  /**
   * Get audit statistics
   * @param {Date} [startTime] - Start time (default: 24 hours ago)
   * @param {Date} [endTime] - End time (default: now)
   * @returns {Promise<Object>} Audit statistics
   */
  async getAuditStats(startTime = null, endTime = null) {
    try {
      const params = [
        startTime || new Date(Date.now() - 24 * 60 * 60 * 1000),
        endTime || new Date(),
      ];

      const result = await this.query(
        'SELECT * FROM get_audit_stats($1, $2)',
        params
      );

      return result.rows[0];
    } catch (error) {
      logError(error, { context: 'Get audit stats' });
      throw error;
    }
  }

  /**
   * Close all connections in pool
   */
  async close() {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      this.connected = false;
      logger.info('PostgreSQL connection pool closed');
    }
  }
}

// Create singleton instance
export const pgClient = new PostgresClient();

export default pgClient;
