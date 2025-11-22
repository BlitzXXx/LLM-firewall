/**
 * Redis Client Module
 * Manages Redis connection with automatic reconnection and error handling
 */

import Redis from 'ioredis';
import { gatewayConfig } from './config.js';
import { logger, logError } from './logger.js';

/**
 * Redis Client Wrapper
 * Provides connection management and common operations
 */
class RedisClient {
  constructor() {
    this.client = null;
    this.connecting = false;
    this.connected = false;
    this.connect();
  }

  /**
   * Connect to Redis server
   */
  connect() {
    if (this.client || this.connecting) {
      return;
    }

    this.connecting = true;

    const options = {
      host: gatewayConfig.redis.host,
      port: gatewayConfig.redis.port,
      db: gatewayConfig.redis.db,
      keyPrefix: gatewayConfig.redis.keyPrefix,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        logger.warn(`Redis connection retry attempt ${times}. Retrying in ${delay}ms...`);
        return delay;
      },
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: false,
    };

    if (gatewayConfig.redis.password) {
      options.password = gatewayConfig.redis.password;
    }

    try {
      this.client = new Redis(options);

      this.client.on('connect', () => {
        logger.info(`Redis client connecting to ${gatewayConfig.redis.host}:${gatewayConfig.redis.port}`);
      });

      this.client.on('ready', () => {
        this.connected = true;
        this.connecting = false;
        logger.info(`Redis client connected and ready (DB: ${gatewayConfig.redis.db})`);
      });

      this.client.on('error', (error) => {
        this.connected = false;
        logError(error, { context: 'Redis client error' });
      });

      this.client.on('close', () => {
        this.connected = false;
        logger.warn('Redis client connection closed');
      });

      this.client.on('reconnecting', (delay) => {
        this.connected = false;
        logger.warn(`Redis client reconnecting in ${delay}ms...`);
      });

    } catch (error) {
      logError(error, { context: 'Redis client initialization' });
      this.client = null;
      this.connected = false;
      this.connecting = false;
    }
  }

  /**
   * Check if Redis is connected and ready
   * @returns {boolean} True if connected
   */
  isConnected() {
    return this.connected && this.client && this.client.status === 'ready';
  }

  /**
   * Health check - ping Redis
   * @returns {Promise<boolean>} True if healthy
   */
  async healthCheck() {
    try {
      if (!this.isConnected()) {
        return false;
      }
      const result = await this.client.ping();
      return result === 'PONG';
    } catch (error) {
      logError(error, { context: 'Redis health check' });
      return false;
    }
  }

  /**
   * Get value by key
   * @param {string} key - Key to get
   * @returns {Promise<string|null>} Value or null
   */
  async get(key) {
    try {
      if (!this.isConnected()) {
        throw new Error('Redis not connected');
      }
      return await this.client.get(key);
    } catch (error) {
      logError(error, { context: 'Redis GET', key });
      throw error;
    }
  }

  /**
   * Set value with optional expiration
   * @param {string} key - Key to set
   * @param {string} value - Value to set
   * @param {number} [ttl] - Time to live in seconds
   * @returns {Promise<string>} OK on success
   */
  async set(key, value, ttl = null) {
    try {
      if (!this.isConnected()) {
        throw new Error('Redis not connected');
      }
      if (ttl) {
        return await this.client.setex(key, ttl, value);
      }
      return await this.client.set(key, value);
    } catch (error) {
      logError(error, { context: 'Redis SET', key });
      throw error;
    }
  }

  /**
   * Increment value atomically
   * @param {string} key - Key to increment
   * @returns {Promise<number>} New value after increment
   */
  async incr(key) {
    try {
      if (!this.isConnected()) {
        throw new Error('Redis not connected');
      }
      return await this.client.incr(key);
    } catch (error) {
      logError(error, { context: 'Redis INCR', key });
      throw error;
    }
  }

  /**
   * Decrement value atomically
   * @param {string} key - Key to decrement
   * @returns {Promise<number>} New value after decrement
   */
  async decr(key) {
    try {
      if (!this.isConnected()) {
        throw new Error('Redis not connected');
      }
      return await this.client.decr(key);
    } catch (error) {
      logError(error, { context: 'Redis DECR', key });
      throw error;
    }
  }

  /**
   * Set expiration time for a key
   * @param {string} key - Key to set expiration
   * @param {number} seconds - Expiration time in seconds
   * @returns {Promise<number>} 1 if timeout was set, 0 if key doesn't exist
   */
  async expire(key, seconds) {
    try {
      if (!this.isConnected()) {
        throw new Error('Redis not connected');
      }
      return await this.client.expire(key, seconds);
    } catch (error) {
      logError(error, { context: 'Redis EXPIRE', key });
      throw error;
    }
  }

  /**
   * Get time to live for a key
   * @param {string} key - Key to check
   * @returns {Promise<number>} TTL in seconds, -1 if no expiry, -2 if key doesn't exist
   */
  async ttl(key) {
    try {
      if (!this.isConnected()) {
        throw new Error('Redis not connected');
      }
      return await this.client.ttl(key);
    } catch (error) {
      logError(error, { context: 'Redis TTL', key });
      throw error;
    }
  }

  /**
   * Delete one or more keys
   * @param {...string} keys - Keys to delete
   * @returns {Promise<number>} Number of keys deleted
   */
  async del(...keys) {
    try {
      if (!this.isConnected()) {
        throw new Error('Redis not connected');
      }
      return await this.client.del(...keys);
    } catch (error) {
      logError(error, { context: 'Redis DEL', keys });
      throw error;
    }
  }

  /**
   * Execute Redis pipeline (multiple commands atomically)
   * @param {Function} callback - Callback that receives pipeline object
   * @returns {Promise<Array>} Results of all commands
   */
  async pipeline(callback) {
    try {
      if (!this.isConnected()) {
        throw new Error('Redis not connected');
      }
      const pipeline = this.client.pipeline();
      callback(pipeline);
      const results = await pipeline.exec();
      return results.map(([err, result]) => {
        if (err) throw err;
        return result;
      });
    } catch (error) {
      logError(error, { context: 'Redis PIPELINE' });
      throw error;
    }
  }

  /**
   * Close Redis connection
   */
  async close() {
    if (this.client) {
      await this.client.quit();
      this.client = null;
      this.connected = false;
      logger.info('Redis client closed');
    }
  }
}

// Create singleton instance
export const redisClient = new RedisClient();

export default redisClient;
