# =============================================================================
# Analyzer Service Dockerfile - Production Optimized
# Multi-stage build with CPU-only dependencies (<800MB target)
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Builder - Install dependencies and download models
# -----------------------------------------------------------------------------
FROM python:3.11-slim AS builder

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    make \
    wget \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Create virtual environment
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Copy requirements
COPY requirements.txt .

# Create production requirements (exclude dev dependencies)
RUN grep -v "^pytest\|^black\|^flake8\|^mypy" requirements.txt > requirements.prod.txt

# Upgrade pip
RUN pip install --no-cache-dir --upgrade pip setuptools wheel

# Install CPU-only PyTorch first (smaller than GPU version)
RUN pip install --no-cache-dir torch==2.5.1 --index-url https://download.pytorch.org/whl/cpu

# Install production dependencies
RUN pip install --no-cache-dir -r requirements.prod.txt

# Download spaCy model (caches in image)
RUN python -m spacy download en_core_web_lg

# Download grpc_health_probe for health checks
RUN GRPC_HEALTH_PROBE_VERSION=v0.4.24 && \
    wget -qO /opt/venv/bin/grpc_health_probe \
    https://github.com/grpc-ecosystem/grpc-health-probe/releases/download/${GRPC_HEALTH_PROBE_VERSION}/grpc_health_probe-linux-amd64 && \
    chmod +x /opt/venv/bin/grpc_health_probe

# -----------------------------------------------------------------------------
# Stage 2: Runtime - Production-only with minimal dependencies
# -----------------------------------------------------------------------------
FROM python:3.11-slim AS runtime

# Install runtime dependencies only
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd -r appuser -g 1001 && \
    useradd -r -g appuser -u 1001 -m -s /sbin/nologin appuser

WORKDIR /app

# Copy virtual environment from builder
COPY --from=builder /opt/venv /opt/venv

# Copy grpc_health_probe
COPY --from=builder /opt/venv/bin/grpc_health_probe /usr/local/bin/

# Set PATH to use virtual environment
ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# Copy proto files
COPY proto/ ./proto/

# Copy source code
COPY --chown=appuser:appuser src/ ./src/

# Switch to non-root user
USER appuser

# Expose gRPC port
EXPOSE 50051

# Health check using grpc_health_probe
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD grpc_health_probe -addr=:50051 || exit 1

# Environment variables (can be overridden)
ENV ANALYZER_PORT=50051 \
    ANALYZER_HOST=0.0.0.0 \
    PII_CONFIDENCE_THRESHOLD=0.7 \
    LOG_LEVEL=INFO

# Start the analyzer service
CMD ["python", "-m", "src.server"]
