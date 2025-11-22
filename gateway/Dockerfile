# =============================================================================
# Gateway Service Dockerfile - Production Optimized
# Multi-stage build for minimal image size (<150MB target)
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Builder - Install dependencies and build proto files
# -----------------------------------------------------------------------------
FROM node:20-alpine AS builder

# Install build dependencies for native modules
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    protobuf-dev

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including dev) for building
RUN npm ci

# Copy proto files and generation script
COPY proto/ ./proto/
COPY scripts/generate-proto.js ./scripts/

# Generate gRPC client code from proto files
RUN npm run proto:gen

# Copy source code
COPY src/ ./src/

# -----------------------------------------------------------------------------
# Stage 2: Runtime - Production-only dependencies
# -----------------------------------------------------------------------------
FROM node:20-alpine AS runtime

# Install curl for health checks
RUN apk add --no-cache curl

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install ONLY production dependencies
RUN npm ci --omit=dev && \
    npm cache clean --force

# Copy generated proto files from builder
COPY --from=builder /app/proto/ ./proto/

# Copy source code
COPY --chown=nodejs:nodejs src/ ./src/

# Switch to non-root user
USER nodejs

# Expose gateway port
EXPOSE 3000

# Health check (runs every 30s, timeout 3s, start period 40s)
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Environment variables (can be overridden)
ENV NODE_ENV=production \
    GATEWAY_PORT=3000 \
    GATEWAY_HOST=0.0.0.0

# Start the gateway service
CMD ["node", "src/index.js"]
