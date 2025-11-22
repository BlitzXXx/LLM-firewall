/**
 * Configuration Module
 * Loads and validates environment variables for the Gateway service
 */

import { config } from 'dotenv';

// Load environment variables from .env file
config();

/**
 * Parse integer from environment variable with default fallback
 */
function parseInt(value, defaultValue) {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Parse boolean from environment variable
 */
function parseBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }
  return value === 'true' || value === '1' || value === 'yes';
}

/**
 * Gateway Service Configuration
 */
export const gatewayConfig = {
  // Server Configuration
  port: parseInt(process.env.GATEWAY_PORT, 3000),
  host: process.env.GATEWAY_HOST || '0.0.0.0',
  env: process.env.NODE_ENV || 'development',

  // Logging Configuration
  log: {
    level: process.env.LOG_LEVEL || 'info',
    pretty: parseBoolean(process.env.LOG_PRETTY, process.env.NODE_ENV === 'development'),
  },

  // Analyzer Service Configuration
  analyzer: {
    host: process.env.ANALYZER_HOST || 'localhost',
    port: parseInt(process.env.ANALYZER_PORT, 50051),
    timeout: parseInt(process.env.GRPC_TIMEOUT_MS, 5000),
    maxRetries: parseInt(process.env.GRPC_MAX_RETRIES, 3),
  },

  // Redis Configuration
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT, 6379),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB, 0),
    keyPrefix: process.env.REDIS_KEY_PREFIX || 'llm_firewall:',
  },

  // Rate Limiting Configuration
  rateLimit: {
    global: parseInt(process.env.RATE_LIMIT_GLOBAL, 10000),
    globalWindow: parseInt(process.env.RATE_LIMIT_GLOBAL_WINDOW, 3600),
    perIp: parseInt(process.env.RATE_LIMIT_PER_IP, 100),
    perIpWindow: parseInt(process.env.RATE_LIMIT_PER_IP_WINDOW, 3600),
    perApiKey: parseInt(process.env.RATE_LIMIT_PER_API_KEY, 1000),
    perApiKeyWindow: parseInt(process.env.RATE_LIMIT_PER_API_KEY_WINDOW, 3600),
  },

  // PostgreSQL Configuration
  postgres: {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT, 5432),
    database: process.env.POSTGRES_DB || 'firewall_audit',
    user: process.env.POSTGRES_USER || 'firewall',
    password: process.env.POSTGRES_PASSWORD || 'changeme_secure_password',
  },

  // Audit Log Configuration
  auditLog: {
    retentionDays: parseInt(process.env.AUDIT_LOG_RETENTION_DAYS, 90),
    async: parseBoolean(process.env.AUDIT_LOG_ASYNC, true),
  },

  // Security Configuration
  security: {
    piiConfidenceThreshold: parseFloat(process.env.PII_CONFIDENCE_THRESHOLD) || 0.7,
    piiEntities: (process.env.PII_ENTITIES || 'EMAIL,PHONE_NUMBER,CREDIT_CARD,SSN,IP_ADDRESS,PERSON,LOCATION').split(','),
    promptInjectionEnabled: parseBoolean(process.env.PROMPT_INJECTION_ENABLED, true),
    promptInjectionSensitivity: process.env.PROMPT_INJECTION_SENSITIVITY || 'moderate',
    specialCharThreshold: parseFloat(process.env.SPECIAL_CHAR_THRESHOLD) || 0.1,
    maxContentLength: parseInt(process.env.MAX_CONTENT_LENGTH, 10240),
    minContentLength: parseInt(process.env.MIN_CONTENT_LENGTH, 1),
  },

  // LLM Provider Configuration
  llm: {
    openai: {
      apiKey: process.env.OPENAI_API_KEY || '',
      apiBase: process.env.OPENAI_API_BASE || 'https://api.openai.com/v1',
      model: process.env.OPENAI_MODEL || 'gpt-4',
      timeout: parseInt(process.env.OPENAI_TIMEOUT_MS, 30000),
    },
    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY || '',
      apiBase: process.env.ANTHROPIC_API_BASE || 'https://api.anthropic.com/v1',
      model: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022',
    },
  },

  // Observability Configuration
  observability: {
    enabled: parseBoolean(process.env.OTEL_ENABLED, true),
    serviceName: process.env.OTEL_SERVICE_NAME || 'llm-firewall-gateway',
    serviceVersion: process.env.OTEL_SERVICE_VERSION || '1.0.0',
    prometheus: {
      port: parseInt(process.env.PROMETHEUS_PORT, 9090),
      metricsEndpoint: process.env.PROMETHEUS_METRICS_ENDPOINT || '/metrics',
    },
    jaeger: {
      enabled: parseBoolean(process.env.JAEGER_ENABLED, false),
      agentHost: process.env.JAEGER_AGENT_HOST || 'localhost',
      agentPort: parseInt(process.env.JAEGER_AGENT_PORT, 6831),
    },
  },

  // Feature Flags
  features: {
    piiDetection: parseBoolean(process.env.FEATURE_PII_DETECTION, true),
    promptInjection: parseBoolean(process.env.FEATURE_PROMPT_INJECTION, true),
    rateLimiting: parseBoolean(process.env.FEATURE_RATE_LIMITING, true),
    auditLogging: parseBoolean(process.env.FEATURE_AUDIT_LOGGING, true),
    anonymization: parseBoolean(process.env.FEATURE_ANONYMIZATION, false),
    mlJailbreak: parseBoolean(process.env.FEATURE_ML_JAILBREAK, false),
  },

  // Security Headers
  cors: {
    enabled: parseBoolean(process.env.CORS_ENABLED, true),
    origin: process.env.CORS_ORIGIN || '*',
    methods: (process.env.CORS_METHODS || 'GET,POST,OPTIONS').split(','),
  },

  helmet: {
    enabled: parseBoolean(process.env.HELMET_ENABLED, true),
  },

  // Health Check Configuration
  healthCheck: {
    interval: parseInt(process.env.HEALTH_CHECK_INTERVAL_MS, 10000),
    readinessTimeout: parseInt(process.env.READINESS_CHECK_TIMEOUT_MS, 2000),
  },

  // Graceful Shutdown
  shutdown: {
    timeout: parseInt(process.env.SHUTDOWN_TIMEOUT_MS, 10000),
  },

  // gRPC Configuration
  grpc: {
    maxMessageSize: parseInt(process.env.GRPC_MAX_MESSAGE_SIZE, 4194304), // 4MB
    maxWorkers: parseInt(process.env.GRPC_MAX_WORKERS, 10),
    keepaliveTime: parseInt(process.env.GRPC_KEEPALIVE_TIME_MS, 10000),
  },
};

/**
 * Validate critical configuration
 */
export function validateConfig() {
  const errors = [];

  // Validate port range
  if (gatewayConfig.port < 1 || gatewayConfig.port > 65535) {
    errors.push(`Invalid GATEWAY_PORT: ${gatewayConfig.port}. Must be between 1-65535.`);
  }

  // Validate log level
  const validLogLevels = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'];
  if (!validLogLevels.includes(gatewayConfig.log.level)) {
    errors.push(`Invalid LOG_LEVEL: ${gatewayConfig.log.level}. Must be one of: ${validLogLevels.join(', ')}`);
  }

  // Validate environment
  const validEnvs = ['development', 'production', 'test'];
  if (!validEnvs.includes(gatewayConfig.env)) {
    errors.push(`Invalid NODE_ENV: ${gatewayConfig.env}. Must be one of: ${validEnvs.join(', ')}`);
  }

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
  }

  return true;
}

/**
 * Get configuration summary (safe for logging - no secrets)
 */
export function getConfigSummary() {
  return {
    environment: gatewayConfig.env,
    server: {
      host: gatewayConfig.host,
      port: gatewayConfig.port,
    },
    analyzer: {
      host: gatewayConfig.analyzer.host,
      port: gatewayConfig.analyzer.port,
    },
    features: gatewayConfig.features,
    observability: {
      enabled: gatewayConfig.observability.enabled,
      serviceName: gatewayConfig.observability.serviceName,
    },
  };
}

export default gatewayConfig;
