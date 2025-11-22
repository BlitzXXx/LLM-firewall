-- =============================================================================
-- PostgreSQL Initialization Script
-- Creates audit_logs table with indexes for the LLM Firewall
-- =============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create audit_logs table
CREATE TABLE IF NOT EXISTS audit_logs (
    -- Primary identifiers
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_id UUID NOT NULL,

    -- Timestamps
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Client information
    client_ip INET NOT NULL,
    api_key_hash VARCHAR(64), -- SHA-256 hash of API key (GDPR compliant)
    user_agent TEXT,

    -- Request details
    request_path VARCHAR(255) NOT NULL,
    http_method VARCHAR(10) NOT NULL,
    request_body_size INTEGER,

    -- Security analysis
    detected_issues JSONB DEFAULT '[]'::jsonb,
    is_blocked BOOLEAN NOT NULL DEFAULT false,
    block_reason VARCHAR(100),
    security_confidence FLOAT,

    -- Response details
    response_status INTEGER NOT NULL,
    latency_ms INTEGER NOT NULL,

    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_client_ip ON audit_logs (client_ip);
CREATE INDEX IF NOT EXISTS idx_audit_logs_is_blocked ON audit_logs (is_blocked) WHERE is_blocked = true;
CREATE INDEX IF NOT EXISTS idx_audit_logs_request_id ON audit_logs (request_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_api_key_hash ON audit_logs (api_key_hash) WHERE api_key_hash IS NOT NULL;

-- Create index for JSON queries on detected_issues
CREATE INDEX IF NOT EXISTS idx_audit_logs_detected_issues ON audit_logs USING gin (detected_issues);

-- Create composite index for time-range queries with filtering
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp_blocked ON audit_logs (timestamp DESC, is_blocked);

-- Add comments for documentation
COMMENT ON TABLE audit_logs IS 'Comprehensive audit log for all LLM Firewall requests';
COMMENT ON COLUMN audit_logs.api_key_hash IS 'SHA-256 hash of API key for GDPR compliance (not reversible)';
COMMENT ON COLUMN audit_logs.detected_issues IS 'JSON array of security issues detected in the request';
COMMENT ON COLUMN audit_logs.security_confidence IS 'Confidence score (0-1) for security analysis';

-- Create function to auto-delete old audit logs (GDPR retention policy: 90 days)
CREATE OR REPLACE FUNCTION delete_old_audit_logs()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM audit_logs
    WHERE timestamp < CURRENT_TIMESTAMP - INTERVAL '90 days';

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Create scheduled job to run cleanup (requires pg_cron extension in production)
-- For development, this can be run manually or via cron job
COMMENT ON FUNCTION delete_old_audit_logs IS 'Deletes audit logs older than 90 days (GDPR compliance)';

-- Grant permissions to firewall user
GRANT SELECT, INSERT, DELETE ON audit_logs TO firewall;
GRANT EXECUTE ON FUNCTION delete_old_audit_logs TO firewall;

-- Log successful initialization
DO $$
BEGIN
    RAISE NOTICE 'LLM Firewall database initialized successfully';
    RAISE NOTICE 'Table created: audit_logs';
    RAISE NOTICE 'Indexes created: 7';
    RAISE NOTICE 'Retention policy: 90 days';
END $$;
