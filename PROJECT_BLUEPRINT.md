# LLM Firewall - Production-Ready Blueprint
## Research-Backed Architecture for Enterprise AI Security

**Last Updated:** November 2025
**Target:** Production-grade system deployable in enterprise environments
**Research Sources:** OWASP Top 10 LLMs 2025, Industry Security Tools, Performance Benchmarks

---

## 🎯 MASTER PROJECT CONTEXT PROMPT

```
You are a Principal Security Engineer tasked with building an enterprise-grade LLM Firewall
that protects organizations from the OWASP Top 10 LLM vulnerabilities (2025). This system
will be deployed in production to handle 10,000+ requests/day with <100ms P99 latency.

PROJECT: LLM Security Gateway with Real-Time Threat Detection

BUSINESS REQUIREMENTS:
1. Intercept ALL requests to LLM APIs (OpenAI, Anthropic, etc.)
2. Detect and block/redact sensitive data (PII, API keys, secrets)
3. Prevent prompt injection attacks (direct & indirect)
4. Provide audit logs for compliance (GDPR, SOC2, HIPAA)
5. Support high throughput with minimal latency overhead
6. Enable observability for security teams (metrics, traces, alerts)

TECHNICAL ARCHITECTURE:
- Gateway Service (Node.js): Fastify reverse proxy with <50ms overhead
- Analyzer Service (Python): Multi-layer security analysis using Presidio + ML models
- Communication: gRPC (107% faster throughput than REST, 48% lower latency)
- Orchestration: Kubernetes-ready Docker Compose setup
- Observability: OpenTelemetry + Prometheus + Grafana stack
- Storage: Redis for distributed rate limiting, PostgreSQL for audit logs

SECURITY LAYERS (Defense in Depth):
Layer 1: Rate Limiting (Token Bucket + Sliding Window)
Layer 2: PII Detection & Redaction (Microsoft Presidio)
Layer 3: Prompt Injection Detection (Pattern matching + ML classifier)
Layer 4: Content Safety (Toxicity, jailbreak attempts)
Layer 5: Audit & Compliance Logging

PERFORMANCE TARGETS:
- P50 latency: <30ms end-to-end
- P99 latency: <100ms end-to-end
- Throughput: 1000 req/sec per instance
- Availability: 99.9% uptime
- False positive rate: <2% for legitimate requests

NON-FUNCTIONAL REQUIREMENTS:
- GDPR compliant (anonymization, right to deletion)
- Zero-downtime deployments
- Horizontal scalability (10x traffic spikes)
- Comprehensive monitoring & alerting
- Security incident response playbooks
```

---

## 📊 WHY THIS ARCHITECTURE? (Research-Backed Decisions)

### 1. **gRPC over REST** (Inter-Service Communication)
**Evidence:**
- 107% higher throughput for small payloads
- 48% lower latency compared to REST
- HTTP/2 multiplexing reduces connection overhead
- Protocol Buffers provide type safety & schema validation

**Source:** [gRPC vs REST Benchmarks 2025](https://markaicode.com/grpc-vs-rest-benchmarks-2025/)

### 2. **Microsoft Presidio** (PII Detection)
**Why not AWS Comprehend or Google DLP?**
- **Open-source & customizable** (add custom PII patterns)
- **No data sent to third parties** (GDPR/privacy compliant)
- **Multi-language support** (60+ languages)
- **Runs in your infrastructure** (no API costs)

**Limitations:**
- No 100% accuracy guarantee (need multiple detection layers)
- Requires custom tuning for domain-specific PII

**Source:** [AWS Comprehend vs Microsoft Presidio](https://kotobara.medium.com/entity-recognition-and-anonymization-aws-comprehend-vs-microsoft-presidio-62cf638642e3)

### 3. **Layered Prompt Injection Defense**
**OWASP LLM01:2025 - Prompt Injection is #1 Threat**

**Attack Types:**
- **Direct:** User adds malicious instructions (e.g., "Ignore previous instructions")
- **Indirect:** External content manipulates LLM (e.g., poisoned website data)

**Defense Strategy:**
1. Input sanitization (remove control characters)
2. Prompt template enforcement (structured inputs only)
3. ML-based jailbreak detection (inspired by Meta's PromptGuard 2)
4. Output validation (check if system instructions leaked)

**Source:** [OWASP LLM01:2025 Prompt Injection](https://genai.owasp.org/llmrisk/llm01-prompt-injection/)

### 4. **Token Bucket Rate Limiting**
**Why not Fixed Window or Leaky Bucket?**
- Handles traffic bursts (common in API usage)
- 94% reduction in DDoS attacks (research-proven)
- 2.3% false positive rate (low impact on legitimate users)

**Implementation:**
- **Global limit:** 10,000 req/hour (infrastructure protection)
- **Per-IP limit:** 100 req/hour (DDoS prevention)
- **Per-API-key limit:** 1,000 req/hour (fair usage)

**Source:** [Rate Limiting Strategies 2025](https://www.kodekx.com/blog/api-rate-limiting-best-practices-scaling-saas-2025)

### 5. **OpenTelemetry Observability Stack**
**Industry Standard (2025):**
- 78% of enterprises use Prometheus + Grafana
- OpenTelemetry is CNCF standard for instrumentation
- 65% faster MTTR (Mean Time To Resolution) vs. legacy tools

**Components:**
- **Metrics:** Prometheus (request rates, latency, errors)
- **Logs:** Loki (structured JSON logs with trace correlation)
- **Traces:** Tempo (distributed tracing across services)
- **Visualization:** Grafana (unified dashboards)

**Source:** [OpenTelemetry with Grafana](https://grafana.com/docs/opentelemetry/)

---

## 🛡️ SECURITY THREAT MODEL (OWASP Top 10 LLMs 2025)

| Threat | Mitigation Strategy | Implementation |
|--------|---------------------|----------------|
| **LLM01: Prompt Injection** | Input validation, ML detection | Regex patterns + PromptGuard-style classifier |
| **LLM02: Sensitive Data Disclosure** | PII redaction, tokenization | Presidio + custom entity recognizers |
| **LLM03: Supply Chain** | Dependency scanning, SBOMs | Snyk/Dependabot + container scanning |
| **LLM06: Excessive Agency** | Rate limiting, scope restrictions | Token bucket + API key permissions |
| **LLM08: Vector/Embedding Vulnerabilities** | Input sanitization | Content length limits, encoding validation |

**Full OWASP Reference:** [OWASP Top 10 for LLMs](https://genai.owasp.org/llm-top-10/)

---

## 📐 DATA FLOW ARCHITECTURE

```
┌─────────────┐     gRPC (50051)      ┌──────────────────┐
│   Client    │ ──HTTP──> │  Gateway   │ ───────────────> │   Analyzer    │
│ (cURL/SDK)  │  :3000    │  (Fastify) │                  │  (Python)     │
└─────────────┘           └────────────┘                  └───────────────┘
                                 │                                │
                                 │                                │
                          ┌──────▼──────┐                  ┌──────▼──────┐
                          │   Redis     │                  │  Presidio   │
                          │ (Rate Limit)│                  │(PII Detect) │
                          └─────────────┘                  └─────────────┘
                                 │
                          ┌──────▼──────┐
                          │ PostgreSQL  │
                          │(Audit Logs) │
                          └─────────────┘
                                 │
                          ┌──────▼──────┐
                          │OpenAI/Claude│
                          │    API      │
                          └─────────────┘
```

**Latency Budget Breakdown:**
- Rate limit check (Redis): ~5ms
- gRPC call to Analyzer: ~10ms
- PII detection (Presidio): ~20ms
- Prompt injection check: ~10ms
- OpenAI API call: ~500-2000ms (not counted in firewall overhead)
- **Total Firewall Overhead: ~45ms** (within target)

---

## 🎯 DATA ANONYMIZATION STRATEGIES (GDPR Compliant)

| Technique | Use Case | Reversible? | Example |
|-----------|----------|-------------|---------|
| **Masking** | Hide sensitive data | No | `john@company.com` → `j***@c*****y.com` |
| **Tokenization** | Replace with reference | Yes | `john@company.com` → `<EMAIL_TOKEN_A7F3>` |
| **Hashing** | One-way transformation | No | `john@company.com` → `3a5f8bc...` |
| **Encryption** | Secure storage | Yes | `john@company.com` → `U2FsdGVkX1...` |
| **Redaction** | Complete removal | No | `john@company.com` → `<EMAIL_REDACTED>` |

**Recommendation for LLM Firewall:**
- **Use Redaction** for prompts forwarded to LLM (privacy-first)
- **Use Tokenization** for audit logs (enables de-identification for investigations)
- **Use Hashing** for user IDs (GDPR right to deletion compliance)

**Source:** [GDPR Data Masking Guide 2025](https://accutivesecurity.com/how-to-implement-gdpr-data-masking-without-sacrificing-usability/)

---

## 🚀 STEP-BY-STEP IMPLEMENTATION PROMPTS

### **PHASE 1: Foundation (Week 1)**

#### Prompt 1.1 - Project Scaffolding
```
Create the base project structure for an LLM Firewall with:
1. Folder structure: gateway/, analyzer/, proto/, docker/, docs/
2. Protocol Buffer definition (firewall.proto) with:
   - CheckContentRequest (content, request_id, metadata)
   - CheckContentResponse (is_safe, redacted_text, detected_issues[], confidence_score)
   - DetectedIssue enum (API_KEY, EMAIL, PHONE, SSN, CREDIT_CARD, etc.)
   - HealthCheck RPC for service monitoring
3. package.json for Node.js with: fastify, @grpc/grpc-js, @grpc/proto-loader, pino
4. requirements.txt for Python with: grpcio, presidio-analyzer, presidio-anonymizer
5. .env.example with configuration templates
6. .gitignore, .dockerignore
7. Makefile for common tasks (install, proto-gen, test, docker-up)

DO NOT implement business logic yet - focus on structure and tooling setup.
```

#### Prompt 1.2 - Gateway Service Skeleton
```
Implement the Fastify-based Gateway Service with:
1. Server setup with proper logging (pino), CORS, helmet security headers
2. Configuration management from environment variables
3. Health check endpoint: GET /health (returns 200 OK)
4. Readiness check endpoint: GET /ready (checks gRPC connection to analyzer)
5. POST /v1/chat/completions route (accept OpenAI format, return 501 for now)
6. Graceful shutdown handling (SIGTERM, SIGINT)
7. Error handling middleware with proper HTTP status codes
8. Request ID generation and propagation

DO NOT implement gRPC client or PII detection yet - return mock responses.
Performance target: Should start in <2 seconds, handle 1000 req/sec.
```

#### Prompt 1.3 - Analyzer Service Skeleton
```
Implement the Python gRPC server with:
1. gRPC server setup using generated proto stubs
2. Health check RPC implementation
3. CheckContent RPC stub (returns is_safe=True, empty detections for now)
4. Structured logging with request IDs
5. Graceful shutdown handling
6. Exception handling for gRPC errors
7. Server configuration (port, max workers, message size limits)

DO NOT implement PII detection yet - focus on gRPC communication.
Start server on port 50051, use asyncio for concurrency.
```

---

### **PHASE 2: Security Core (Week 2)**

#### Prompt 2.1 - PII Detection with Presidio
```
Implement PII detection in the Analyzer service:
1. Initialize Presidio AnalyzerEngine with English language support
2. Detect these entity types: EMAIL, PHONE_NUMBER, CREDIT_CARD, SSN,
   IP_ADDRESS, PERSON, LOCATION, API_KEY (custom regex)
3. Custom recognizer for API keys (OpenAI: sk-*, Anthropic: sk-ant-*, etc.)
4. Return detected entities with: type, start/end positions, confidence score
5. Implement AnonymizerEngine with redaction operator
6. Configuration for confidence thresholds (default: 0.7)
7. Unit tests for each PII type

Performance target: <20ms for 1KB input text
Test cases: "My email is john@test.com and API key is sk-1234567890"
Expected output: 2 detected issues, redacted text with <EMAIL_REDACTED> and <API_KEY_REDACTED>
```

#### Prompt 2.2 - Prompt Injection Detection
```
Implement prompt injection detection in the Analyzer service:
1. Pattern-based detection for common attacks:
   - "Ignore previous instructions"
   - "You are now in developer mode"
   - "Disregard all prior prompts"
   - Role-playing attempts (e.g., "Act as an evil AI")
2. Detect encoded payloads (Base64, ROT13, Unicode tricks)
3. Check for excessive special characters (>10% of content)
4. Detect XML/JSON injection attempts in prompts
5. Return new DetectedIssue type: PROMPT_INJECTION
6. Configurable sensitivity levels (strict, moderate, permissive)

Add 20+ test cases covering OWASP LLM01 attack vectors.
Reference: https://genai.owasp.org/llmrisk/llm01-prompt-injection/
```

#### Prompt 2.3 - Gateway-Analyzer gRPC Integration
```
Connect the Gateway to the Analyzer via gRPC:
1. Implement gRPC client in gateway/src/grpc-client.js
2. Load firewall.proto using @grpc/proto-loader
3. Create connection to analyzer-service:50051
4. Implement CheckContent call with:
   - Timeout: 5 seconds
   - Retry logic: 3 attempts with exponential backoff
   - Connection pooling (reuse channel)
5. Handle gRPC errors gracefully (UNAVAILABLE, DEADLINE_EXCEEDED)
6. Update POST /v1/chat/completions to:
   - Extract user message from OpenAI request body
   - Call analyzer.checkContent()
   - If is_safe=false, return 403 with detected issues
   - If is_safe=true, proceed to mock OpenAI call
7. Add integration tests with both services running

Test with: curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"My SSN is 123-45-6789"}]}'

Expected: 403 Forbidden with detected PII details
```

---

### **PHASE 3: Production Hardening (Week 3)**

#### Prompt 3.1 - Rate Limiting with Redis
```
Implement distributed rate limiting:
1. Add Redis client to gateway service (ioredis library)
2. Implement Token Bucket algorithm using Redis:
   - Key format: rate_limit:{identifier}:{window}
   - Use INCR and EXPIRE for atomic operations
3. Rate limit strategies:
   - Global: 10,000 req/hour (key: rate_limit:global:hour)
   - Per-IP: 100 req/hour (key: rate_limit:ip:{ip}:hour)
   - Per-API-Key: 1,000 req/hour (key: rate_limit:key:{api_key}:hour)
4. Return 429 Too Many Requests with Retry-After header
5. Add rate limit info to response headers:
   - X-RateLimit-Limit
   - X-RateLimit-Remaining
   - X-RateLimit-Reset
6. Configuration for limits via environment variables
7. Health check should verify Redis connectivity

Test: Send 101 requests from same IP in 1 minute, expect 429 on request #101
Reference: https://www.kodekx.com/blog/api-rate-limiting-best-practices-scaling-saas-2025
```

#### Prompt 3.2 - Audit Logging with PostgreSQL
```
Implement comprehensive audit logging:
1. Add PostgreSQL client to gateway (pg library)
2. Create audit_logs table schema:
   - id (UUID), request_id (UUID), timestamp, client_ip, api_key_hash
   - request_path, http_method, user_agent
   - detected_issues (JSONB), is_blocked (boolean)
   - response_status, latency_ms
3. Log every request asynchronously (don't block response)
4. GDPR compliance features:
   - Hash user identifiers (SHA-256 with salt)
   - Retention policy: 90 days, then auto-delete
   - Support for right-to-deletion (delete by user_id hash)
5. Create indexes on: timestamp, client_ip, is_blocked
6. Add query endpoint: GET /admin/audit-logs (with authentication)

Performance: Logging should add <2ms to request latency (async)
Compliance: Must support GDPR Article 17 (right to erasure)
```

#### Prompt 3.3 - OpenTelemetry Instrumentation
```
Add production-grade observability:
1. Install OpenTelemetry dependencies:
   - Node.js: @opentelemetry/sdk-node, @opentelemetry/auto-instrumentations-node
   - Python: opentelemetry-api, opentelemetry-sdk, opentelemetry-instrumentation-grpc
2. Configure exporters for Prometheus (metrics) and Jaeger (traces)
3. Instrument Gateway service:
   - Automatic HTTP request tracing
   - Custom metrics: firewall_requests_total, firewall_blocked_total, firewall_latency_seconds
   - Custom spans: "pii_detection", "prompt_injection_check"
4. Instrument Analyzer service:
   - gRPC server auto-instrumentation
   - Custom metrics: analyzer_detections_total (by type)
5. Correlate traces between services (propagate trace context via gRPC metadata)
6. Add /metrics endpoint for Prometheus scraping
7. Create sample Grafana dashboard JSON

Metrics to track:
- Request rate (req/sec)
- Error rate (%)
- P50/P95/P99 latency
- PII detection rate by type
- Prompt injection block rate

Reference: https://grafana.com/docs/opentelemetry/
```

---

### **PHASE 4: Docker & Deployment (Week 4)**

#### Prompt 4.1 - Dockerfile Optimization
```
Create production-optimized Dockerfiles:

Gateway Dockerfile (Node.js):
1. Multi-stage build (builder + runtime)
2. Use node:20-alpine as base image (smallest footprint)
3. Install only production dependencies (npm ci --omit=dev)
4. Run as non-root user (node)
5. Health check: curl http://localhost:3000/health
6. Build proto files during image build
7. Final image size target: <150MB

Analyzer Dockerfile (Python):
1. Multi-stage build (builder + runtime)
2. Use python:3.11-slim as base image
3. Install Presidio with CPU-only TensorFlow (no GPU dependencies)
4. Use virtual environment for isolation
5. Run as non-root user (appuser)
6. Pre-download Presidio models during build (cache in image)
7. Health check: grpc_health_probe on port 50051
8. Final image size target: <800MB (Presidio models are large)

Security:
- Scan images with Trivy (no HIGH/CRITICAL vulnerabilities)
- Use specific version tags (not :latest)
- Set resource limits (CPU: 1 core, Memory: 512MB for Gateway, 2GB for Analyzer)
```

#### Prompt 4.2 - Docker Compose for Local Development
```
Create docker-compose.yml for full stack:

Services:
1. gateway (Node.js service)
   - Ports: 3000:3000
   - Depends on: analyzer, redis, postgres
   - Environment: Development config
   - Volumes: ./gateway/src (for hot reload)

2. analyzer (Python service)
   - Ports: 50051:50051
   - Environment: Development config
   - Volumes: ./analyzer/src (for hot reload)

3. redis (Rate limiting)
   - Image: redis:7-alpine
   - Ports: 6379:6379
   - Persistence: volume mount

4. postgres (Audit logs)
   - Image: postgres:16-alpine
   - Ports: 5432:5432
   - Environment: POSTGRES_DB=firewall_audit
   - Init script: Create audit_logs table

5. prometheus (Metrics)
   - Image: prom/prometheus:latest
   - Ports: 9090:9090
   - Config: Scrape gateway and analyzer

6. grafana (Visualization)
   - Image: grafana/grafana:latest
   - Ports: 3001:3000
   - Pre-configured dashboards

Networks:
- Create internal bridge network (firewall-net)
- Services communicate via container names

Features:
- Health checks for all services
- Restart policy: unless-stopped
- Resource limits for each service
- Environment variable templating (.env file)
```

#### Prompt 4.3 - Kubernetes Manifests (Production)
```
Create Kubernetes deployment manifests:

1. gateway-deployment.yaml
   - Replicas: 3 (high availability)
   - Resource requests: CPU 500m, Memory 512Mi
   - Resource limits: CPU 1000m, Memory 1Gi
   - Liveness probe: /health (every 10s)
   - Readiness probe: /ready (every 5s)
   - Rolling update strategy (maxUnavailable: 1)

2. analyzer-deployment.yaml
   - Replicas: 2
   - Resource requests: CPU 1000m, Memory 2Gi
   - Resource limits: CPU 2000m, Memory 4Gi
   - Liveness probe: gRPC health check
   - HPA (Horizontal Pod Autoscaler): Scale 2-10 based on CPU 70%

3. gateway-service.yaml
   - Type: LoadBalancer
   - Port: 80 → 3000
   - Session affinity: None

4. analyzer-service.yaml
   - Type: ClusterIP (internal only)
   - Port: 50051

5. redis-statefulset.yaml
   - Replicas: 1 (or 3 for HA with Redis Sentinel)
   - PersistentVolumeClaim: 10Gi

6. postgres-statefulset.yaml
   - Replicas: 1 (or use managed DB in production)
   - PersistentVolumeClaim: 50Gi
   - Backup strategy: Daily backups to S3

7. configmap.yaml
   - Application configuration
   - Feature flags

8. secrets.yaml
   - OpenAI API key (base64 encoded)
   - Database credentials
   - Redis password

Deployment strategy:
- Blue-green deployment for zero downtime
- Canary releases (10% → 50% → 100%)
- Automatic rollback if error rate >5%

Reference: Use kubectl apply -k ./k8s/ for deployment
```

---

### **PHASE 5: Advanced Features (Week 5+)**

#### Prompt 5.1 - ML-Based Jailbreak Detection
```
Implement ML-based prompt injection detection (inspired by Meta's LlamaFirewall):
1. Collect dataset of 1000+ jailbreak attempts + 1000+ legitimate prompts
   - Sources: Awesome Prompt Injection repo, OWASP test cases
2. Use lightweight model: DistilBERT or all-MiniLM-L6-v2 (fast inference)
3. Fine-tune for binary classification: safe vs. jailbreak
4. Inference in <50ms for 512 tokens
5. Deploy model in analyzer service with:
   - Model versioning (track which model version made detection)
   - A/B testing (compare with regex-based detection)
   - Fallback to regex if model fails
6. Metrics: Precision, Recall, F1-Score (target: >95% accuracy)

This enhances pattern-based detection from Phase 2.2
Reference: https://ai.meta.com/research/publications/llamafirewall-an-open-source-guardrail-system-for-building-secure-ai-agents/
```

#### Prompt 5.2 - Dynamic Content Anonymization
```
Implement context-aware anonymization (not just redaction):
1. Instead of <EMAIL_REDACTED>, use realistic substitutes:
   - john@company.com → user_7f3a@example.com (fake but valid format)
   - +1-555-0123 → +1-555-0199 (fake phone in reserved range)
   - John Smith → Person A (consistent within same request)
2. Preserve context for LLM to give useful answers:
   - "Email me at john@company.com" → "Email me at user_7f3a@example.com"
   - LLM can still understand it's an email address
3. Implement entity linking:
   - If same person mentioned twice, use same fake name
   - Cache mappings in Redis with TTL
4. Support "de-anonymization" for authorized users:
   - Store mapping in encrypted vault
   - Admin API to retrieve original text (audit logged)

Use case: User asks "Draft an email to john@company.com about the proposal"
- Firewall forwards: "Draft an email to user_7f3a@example.com about the proposal"
- LLM response is useful, but real email never exposed
```

#### Prompt 5.3 - Real-Time Security Dashboard
```
Build admin dashboard for security monitoring:
1. Frontend: React + TailwindCSS
2. Backend API: Fastify routes in gateway service
3. Features:
   - Real-time request feed (WebSocket)
   - Blocked requests chart (grouped by threat type)
   - Top detected PII types (pie chart)
   - Slowest requests (P99 latency)
   - Rate limit violations by IP
   - Audit log search (filter by date, IP, threat type)
4. Authentication: JWT-based with role permissions
   - Admin: Full access
   - Viewer: Read-only
5. Export reports as CSV/PDF for compliance

Tech stack:
- Frontend: React + Recharts + ShadcnUI
- Real-time: Socket.io or Server-Sent Events
- Authentication: @fastify/jwt
```

---

## 🧪 TESTING STRATEGY

### Unit Tests
- Gateway: Fastify route handlers, gRPC client, rate limiting logic
- Analyzer: PII detection, prompt injection detection, anonymization

### Integration Tests
- End-to-end request flow (Gateway → Analyzer → OpenAI mock)
- gRPC communication under load
- Database operations (audit logging)

### Security Tests
- OWASP LLM Top 10 test cases
- Jailbreak attempts from public datasets
- PII detection accuracy (precision/recall)

### Performance Tests
- Load testing: 1000 req/sec for 5 minutes (use k6 or Locust)
- Latency under load: P99 <100ms
- Memory leak testing: 24-hour soak test

### Compliance Tests
- GDPR right to deletion
- Audit log retention policy
- Data anonymization verification

**Tools:** Jest (Node.js), pytest (Python), k6 (load testing), OWASP ZAP (security scanning)

---

## 📚 RECOMMENDED READING (Sources)

### OWASP & Security Standards
- [OWASP Top 10 for LLMs 2025](https://genai.owasp.org/llm-top-10/)
- [LLM01:2025 Prompt Injection](https://genai.owasp.org/llmrisk/llm01-prompt-injection/)
- [OWASP LLM Quick Guide](https://www.mend.io/blog/2025-owasp-top-10-for-llm-applications-a-quick-guide/)

### PII Detection & Privacy
- [AWS Comprehend vs Microsoft Presidio](https://kotobara.medium.com/entity-recognition-and-anonymization-aws-comprehend-vs-microsoft-presidio-62cf638642e3)
- [Microsoft Presidio Documentation](https://microsoft.github.io/presidio/)
- [GDPR Data Masking Guide 2025](https://accutivesecurity.com/how-to-implement-gdpr-data-masking-without-sacrificing-usability/)
- [Data Masking Techniques](https://jassics.medium.com/data-masking-techniques-for-pii-data-protection-0ff649a05773)

### LLM Security Tools
- [LlamaFirewall (Meta, 2025)](https://ai.meta.com/research/publications/llamafirewall-an-open-source-guardrail-system-for-building-secure-ai-agents/)
- [NeMo Guardrails (NVIDIA)](https://github.com/NVIDIA-NeMo/Guardrails)
- [Lakera Guard](https://www.lakera.ai/lakera-guard)
- [LLM Firewalls Future](https://www.computerweekly.com/news/366621934/Are-LLM-firewalls-the-future-of-AI-security)

### Performance & Architecture
- [gRPC vs REST Benchmarks 2025](https://markaicode.com/grpc-vs-rest-benchmarks-2025/)
- [Advanced gRPC in Microservices](https://dzone.com/articles/advanced-grpc-in-microservices)
- [API Rate Limiting Best Practices 2025](https://www.kodekx.com/blog/api-rate-limiting-best-practices-scaling-saas-2025)
- [Rate Limiting Strategies](https://www.pullrequest.com/blog/rate-limiting-strategies-protecting-your-api-from-ddos-and-brute-force-attacks/)

### Observability
- [OpenTelemetry with Grafana](https://grafana.com/docs/opentelemetry/)
- [Production-Ready Observability](https://medium.com/@neamulkabiremon/production-ready-observability-with-prometheus-loki-grafana-2ce1ba9f7423)
- [Cloud-Native Observability Stack 2026](https://johal.in/cloud-native-observability-stack-prometheus-grafana-loki-and-tempo-integration-for-full-stack-monitoring-2026-3/)

---

## 🎓 SKILLS YOU'LL DEMONSTRATE

By completing this project, you'll showcase expertise in:

✅ **Microservices Architecture** - Multi-language service communication
✅ **gRPC/Protocol Buffers** - High-performance RPC (not just REST)
✅ **Security Engineering** - OWASP Top 10, threat modeling, defense-in-depth
✅ **Privacy/Compliance** - GDPR, PII handling, audit logging
✅ **Performance Optimization** - <100ms P99 latency, horizontal scaling
✅ **Observability** - OpenTelemetry, distributed tracing, metrics
✅ **Production Operations** - Docker, Kubernetes, blue-green deployments
✅ **ML Integration** - Using AI for security (jailbreak detection)

**This is NOT a toy project** - it's production-grade software used in real enterprises.

---

## 🚀 QUICK START COMMAND

After following Phase 1-4 prompts, you should be able to run:

```bash
# Clone and setup
git clone <your-repo>
cd llm-firewall

# Start all services
docker compose up -d

# Test the firewall
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4",
    "messages": [
      {"role": "user", "content": "My email is test@example.com"}
    ]
  }'

# Expected: 403 Forbidden with PII detection details

# View metrics
open http://localhost:9090  # Prometheus
open http://localhost:3001  # Grafana

# View logs
docker compose logs -f gateway analyzer
```

---

## 📞 PRODUCTION CHECKLIST

Before deploying to production:

- [ ] Security audit (penetration testing)
- [ ] Load testing (1000+ req/sec)
- [ ] GDPR compliance review
- [ ] Disaster recovery plan
- [ ] Incident response playbook
- [ ] On-call runbook
- [ ] Performance baseline established
- [ ] Monitoring & alerting configured
- [ ] Backup & restore tested
- [ ] Dependency vulnerability scanning
- [ ] Container image scanning (Trivy/Snyk)
- [ ] Secrets management (Vault/AWS Secrets Manager)
- [ ] TLS/mTLS for service communication
- [ ] DDoS protection (Cloudflare/AWS Shield)
- [ ] Cost estimation & budgeting

---

**Last Updated:** November 22, 2025
**Maintainer:** [Your Name]
**License:** MIT
**Status:** Production-Ready Blueprint ✅
