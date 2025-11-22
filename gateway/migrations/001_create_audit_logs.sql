-- Migration: Create audit_logs table
-- Phase 3.2: Audit Logging with PostgreSQL
-- GDPR Compliant: Hashes PII, 90-day retention, supports right to deletion

-- Create audit_logs table
CREATE TABLE IF NOT EXISTS audit_logs (
    -- Primary identifiers
    id BIGSERIAL PRIMARY KEY,
    request_id VARCHAR(255) NOT NULL,

    -- Timestamp
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    -- Request metadata
    method VARCHAR(10) NOT NULL,
    path TEXT NOT NULL,

    -- Client information (GDPR: hashed for privacy)
    client_ip_hash VARCHAR(64) NOT NULL,  -- SHA-256 hash of IP
    user_agent_hash VARCHAR(64),          -- SHA-256 hash of user agent

    -- Authentication (GDPR: hashed for privacy)
    api_key_hash VARCHAR(64),             -- SHA-256 hash of API key (first 8 chars for reference)

    -- Request/Response information
    request_size_bytes INTEGER,
    response_status INTEGER NOT NULL,
    response_size_bytes INTEGER,
    response_time_ms INTEGER NOT NULL,

    -- Security analysis results
    is_blocked BOOLEAN NOT NULL DEFAULT false,
    block_reason VARCHAR(50),  -- RATE_LIMIT, PII_DETECTED, PROMPT_INJECTION, etc.
    detected_issues_count INTEGER DEFAULT 0,
    security_confidence DECIMAL(3, 2),  -- 0.00 to 1.00

    -- LLM Provider information
    llm_provider VARCHAR(50),   -- openai, anthropic, etc.
    llm_model VARCHAR(100),     -- gpt-4, claude-3-sonnet, etc.

    -- Metadata (JSONB for flexible additional data)
    metadata JSONB,

    -- GDPR compliance
    retention_until TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() + INTERVAL '90 days'),

    -- Indexes for common queries
    CONSTRAINT valid_status CHECK (response_status >= 100 AND response_status < 600),
    CONSTRAINT valid_confidence CHECK (security_confidence IS NULL OR (security_confidence >= 0 AND security_confidence <= 1))
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_client_ip_hash ON audit_logs(client_ip_hash);
CREATE INDEX IF NOT EXISTS idx_audit_logs_is_blocked ON audit_logs(is_blocked) WHERE is_blocked = true;
CREATE INDEX IF NOT EXISTS idx_audit_logs_request_id ON audit_logs(request_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_response_status ON audit_logs(response_status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_retention_until ON audit_logs(retention_until);
CREATE INDEX IF NOT EXISTS idx_audit_logs_api_key_hash ON audit_logs(api_key_hash) WHERE api_key_hash IS NOT NULL;

-- Create index on metadata JSONB for flexible queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_metadata ON audit_logs USING GIN(metadata);

-- Create function for automatic cleanup of expired records (GDPR compliance)
CREATE OR REPLACE FUNCTION cleanup_expired_audit_logs()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM audit_logs
    WHERE retention_until < NOW();

    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    RETURN deleted_count;
END;
$$;

-- Create function to delete audit logs for a specific client (GDPR right to deletion)
CREATE OR REPLACE FUNCTION delete_audit_logs_by_client(p_client_ip_hash VARCHAR(64))
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM audit_logs
    WHERE client_ip_hash = p_client_ip_hash;

    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    RETURN deleted_count;
END;
$$;

-- Create function to get audit statistics
CREATE OR REPLACE FUNCTION get_audit_stats(
    p_start_time TIMESTAMP WITH TIME ZONE DEFAULT NOW() - INTERVAL '24 hours',
    p_end_time TIMESTAMP WITH TIME ZONE DEFAULT NOW()
)
RETURNS TABLE (
    total_requests BIGINT,
    blocked_requests BIGINT,
    block_rate DECIMAL(5,2),
    avg_response_time_ms DECIMAL(10,2),
    unique_clients BIGINT,
    requests_by_status JSONB
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*)::BIGINT as total_requests,
        SUM(CASE WHEN is_blocked THEN 1 ELSE 0 END)::BIGINT as blocked_requests,
        (SUM(CASE WHEN is_blocked THEN 1 ELSE 0 END)::DECIMAL / NULLIF(COUNT(*), 0) * 100)::DECIMAL(5,2) as block_rate,
        AVG(response_time_ms)::DECIMAL(10,2) as avg_response_time_ms,
        COUNT(DISTINCT client_ip_hash)::BIGINT as unique_clients,
        jsonb_object_agg(
            response_status::TEXT,
            status_count
        ) as requests_by_status
    FROM (
        SELECT
            response_status,
            COUNT(*) as status_count
        FROM audit_logs
        WHERE timestamp >= p_start_time
          AND timestamp <= p_end_time
        GROUP BY response_status
    ) status_counts
    CROSS JOIN audit_logs
    WHERE audit_logs.timestamp >= p_start_time
      AND audit_logs.timestamp <= p_end_time;
END;
$$;

-- Add comments for documentation
COMMENT ON TABLE audit_logs IS 'Audit log for all LLM firewall requests (GDPR compliant with 90-day retention)';
COMMENT ON COLUMN audit_logs.client_ip_hash IS 'SHA-256 hash of client IP address (GDPR: no raw IP stored)';
COMMENT ON COLUMN audit_logs.user_agent_hash IS 'SHA-256 hash of user agent string (GDPR: no raw user agent stored)';
COMMENT ON COLUMN audit_logs.api_key_hash IS 'SHA-256 hash of API key (GDPR: no raw key stored)';
COMMENT ON COLUMN audit_logs.retention_until IS 'GDPR: Automatic deletion after 90 days';
COMMENT ON FUNCTION cleanup_expired_audit_logs() IS 'GDPR: Delete audit logs past retention period (should be run daily via cron)';
COMMENT ON FUNCTION delete_audit_logs_by_client(VARCHAR) IS 'GDPR: Right to deletion - remove all logs for a specific client';
COMMENT ON FUNCTION get_audit_stats(TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE) IS 'Get audit statistics for a time range';
