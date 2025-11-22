# Security Dashboard API Specification

**Phase 5.3 - Real-Time Security Dashboard**  
**Status:** API Specification (Backend routes can be implemented using this spec)

---

## Overview

The Security Dashboard provides real-time monitoring and historical analysis of the LLM Firewall's security events.

### Tech Stack Recommendation

**Backend:**
- Fastify routes in Gateway service
- PostgreSQL for audit log queries
- WebSocket/Server-Sent Events for real-time updates

**Frontend:**
- React + TypeScript
- TailwindCSS + shadcn/ui
- Recharts for visualizations
- TanStack Query for data fetching

---

## API Endpoints

### 1. GET `/api/dashboard/stats`

Get aggregated security statistics.

**Query Parameters:**
- `timeRange` (optional): `1h`, `24h`, `7d`, `30d` (default: `24h`)

**Response:**
```json
{
  "timeRange": "24h",
  "overview": {
    "total_requests": 15420,
    "blocked_requests": 342,
    "allowed_requests": 15078,
    "avg_latency_ms": 45.2,
    "p50_latency_ms": 38,
    "p95_latency_ms": 89,
    "p99_latency_ms": 156
  },
  "blockReasons": [
    { "block_reason": "PII_DETECTED", "count": 189 },
    { "block_reason": "PROMPT_INJECTION", "count": 98 },
    { "block_reason": "ML_JAILBREAK", "count": 55 }
  ],
  "piiTypes": [
    { "pii_type": "EMAIL", "count": 245 },
    { "pii_type": "PHONE_NUMBER", "count": 123 },
    { "pii_type": "API_KEY", "count": 67 }
  ],
  "topBlockedIPs": [
    { "ip": "203.0.113.45", "count": 23 },
    { "ip": "198.51.100.12", "count": 18 }
  ]
}
```

### 2. GET `/api/dashboard/recent`

Get recent requests feed.

**Query Parameters:**
- `limit` (optional): Max 100, default 50
- `blockedOnly` (optional): `true` or `false`

**Response:**
```json
{
  "requests": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "requestId": "req_abc123",
      "timestamp": "2025-11-22T14:30:45Z",
      "clientIp": "203.0.113.45",
      "path": "/v1/chat/completions",
      "method": "POST",
      "detectedIssues": [
        {
          "type": "EMAIL",
          "text": "user@example.com",
          "confidence": 0.95
        }
      ],
      "isBlocked": true,
      "blockReason": "PII_DETECTED",
      "status": 403,
      "latencyMs": 42
    }
  ],
  "count": 50
}
```

### 3. GET `/api/dashboard/search`

Search and filter audit logs.

**Query Parameters:**
- `startDate` (optional): ISO 8601 datetime
- `endDate` (optional): ISO 8601 datetime
- `clientIp` (optional): Filter by IP
- `isBlocked` (optional): `true` or `false`
- `blockReason` (optional): Specific block reason
- `limit` (optional): Max 1000, default 100
- `offset` (optional): For pagination

**Response:**
```json
{
  "results": [...],
  "pagination": {
    "total": 1523,
    "limit": 100,
    "offset": 0,
    "hasMore": true
  }
}
```

### 4. GET `/api/dashboard/export`

Export audit logs as CSV or JSON.

**Query Parameters:**
- `format`: `csv` or `json` (default: `csv`)
- `timeRange`: Same as `/stats`

**Response (CSV):**
```csv
Timestamp,Request ID,Client IP,Path,Method,Blocked,Block Reason,Status,Latency (ms)
2025-11-22T14:30:45Z,req_abc123,203.0.113.45,/v1/chat/completions,POST,true,PII_DETECTED,403,42
```

### 5. GET `/api/dashboard/timeline`

Get timeline data for charts.

**Query Parameters:**
- `timeRange`: `1h`, `24h`, `7d`, `30d`
- `interval`: `5m`, `1h`, `1d` (bucket size)

**Response:**
```json
{
  "timeRange": "24h",
  "interval": "1h",
  "data": [
    {
      "timestamp": "2025-11-22T13:00:00Z",
      "totalRequests": 642,
      "blockedRequests": 18,
      "avgLatency": 43.2
    },
    {
      "timestamp": "2025-11-22T14:00:00Z",
      "totalRequests": 689,
      "blockedRequests": 23,
      "avgLatency": 45.8
    }
  ]
}
```

### 6. WebSocket `/ws/dashboard/live`

Real-time request feed via WebSocket.

**Client sends:**
```json
{
  "action": "subscribe",
  "filters": {
    "blockedOnly": true
  }
}
```

**Server sends:**
```json
{
  "type": "request",
  "data": {
    "requestId": "req_xyz789",
    "timestamp": "2025-11-22T14:35:12Z",
    "clientIp": "198.51.100.42",
    "isBlocked": true,
    "blockReason": "ML_JAILBREAK"
  }
}
```

---

## Dashboard UI Components

### 1. Overview Cards

```
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ Total Requests  │  │ Blocked         │  │ Block Rate      │  │ Avg Latency     │
│   15,420        │  │   342           │  │   2.2%          │  │   45ms          │
│  ↑ 12% vs 1h ago│  │  ↑ 5% vs 1h ago │  │  ↑ 0.3% vs 1h  │  │  ↓ 2ms vs 1h   │
└─────────────────┘  └─────────────────┘  └─────────────────┘  └─────────────────┘
```

### 2. Request Timeline Chart

Line chart showing:
- Total requests (blue line)
- Blocked requests (red line)
- Overlay: Avg latency (gray bars)

### 3. Block Reasons Breakdown

Pie chart:
- PII_DETECTED: 55%
- PROMPT_INJECTION: 29%
- ML_JAILBREAK: 16%

### 4. Recent Requests Table

| Time | IP | Path | Status | Block Reason | Latency |
|------|----|----|--------|--------------|---------|
| 14:35:12 | 203.0.113.45 | /v1/chat/completions | 403 | PII_DETECTED | 42ms |
| 14:35:09 | 198.51.100.12 | /v1/chat/completions | 200 | - | 38ms |

### 5. PII Detections Heatmap

Show which PII types are detected most frequently:
- EMAIL: ████████████████████ 245
- PHONE: ████████████ 123
- API_KEY: ██████ 67

---

## Authentication & Authorization

### JWT-based Auth

**POST `/api/auth/login`**
```json
{
  "username": "admin",
  "password": "secure_password"
}
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 3600,
  "role": "admin"
}
```

### Roles

- **admin**: Full access (view, export, delete logs)
- **viewer**: Read-only access (view dashboard, search logs)
- **auditor**: View + export (no delete)

### Protected Routes

All `/api/dashboard/*` routes require:
```
Authorization: Bearer <JWT_TOKEN>
```

---

## Implementation Guide

### Backend (Fastify)

**1. Install dependencies:**
```bash
npm install @fastify/jwt @fastify/websocket
```

**2. Create dashboard routes:**
```javascript
// gateway/src/routes/dashboard.js
export default async function dashboardRoutes(fastify, options) {
  // Add JWT authentication
  fastify.addHook('onRequest', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.status(401).send({ error: 'Unauthorized' });
    }
  });

  // Implement each endpoint from the spec
  fastify.get('/api/dashboard/stats', async (request, reply) => {
    // Implementation
  });
}
```

**3. Register routes:**
```javascript
// gateway/src/index.js
import dashboardRoutes from './routes/dashboard.js';

await fastify.register(dashboardRoutes);
```

### Frontend (React)

**1. Setup project:**
```bash
npx create-react-app dashboard --template typescript
cd dashboard
npm install @tanstack/react-query recharts shadcn/ui
```

**2. API client:**
```typescript
// src/api/dashboard.ts
export async function getDashboardStats(timeRange: string) {
  const response = await fetch(
    `/api/dashboard/stats?timeRange=${timeRange}`,
    {
      headers: {
        'Authorization': `Bearer ${getToken()}`
      }
    }
  );
  return response.json();
}
```

**3. Dashboard component:**
```typescript
// src/components/Dashboard.tsx
import { useQuery } from '@tanstack/react-query';
import { getDashboardStats } from '../api/dashboard';

export function Dashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['stats', '24h'],
    queryFn: () => getDashboardStats('24h'),
    refetchInterval: 30000, // Refresh every 30s
  });

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="grid grid-cols-4 gap-4">
      <StatCard
        title="Total Requests"
        value={data.overview.total_requests}
      />
      {/* More cards */}
    </div>
  );
}
```

---

## Security Considerations

1. **Rate Limiting**: Limit dashboard API calls to prevent abuse
2. **CORS**: Configure CORS for dashboard frontend domain
3. **Input Validation**: Validate all query parameters
4. **SQL Injection**: Use parameterized queries (already done in audit logger)
5. **Session Management**: JWT with short expiration + refresh tokens
6. **Audit Logging**: Log all dashboard access (who viewed what)

---

## Performance Optimization

1. **Database Indexes**: Already created in Phase 3.2
   - `idx_audit_logs_timestamp` (for time-range queries)
   - `idx_audit_logs_is_blocked` (for filtering)
   - `idx_audit_logs_client_ip` (for IP filtering)

2. **Caching**: Redis cache for dashboard stats (5-minute TTL)
   ```javascript
   const cacheKey = `dashboard:stats:${timeRange}`;
   const cached = await redis.get(cacheKey);
   if (cached) return JSON.parse(cached);

   const stats = await fetchStatsFromDB();
   await redis.setex(cacheKey, 300, JSON.stringify(stats));
   return stats;
   ```

3. **Pagination**: Always use LIMIT/OFFSET
4. **Aggregation**: Pre-compute daily stats via cron job

---

## Testing

### API Tests

```javascript
// tests/dashboard.test.js
test('GET /api/dashboard/stats returns aggregated data', async () => {
  const response = await fastify.inject({
    method: 'GET',
    url: '/api/dashboard/stats?timeRange=24h',
    headers: {
      'Authorization': `Bearer ${getTestToken()}`
    }
  });

  expect(response.statusCode).toBe(200);
  expect(response.json()).toMatchObject({
    overview: {
      total_requests: expect.any(Number),
      blocked_requests: expect.any(Number),
    }
  });
});
```

### Frontend Tests

```typescript
// src/components/Dashboard.test.tsx
test('Dashboard renders stats correctly', async () => {
  const mockStats = {
    overview: { total_requests: 100, blocked_requests: 10 }
  };

  jest.spyOn(api, 'getDashboardStats').mockResolvedValue(mockStats);

  render(<Dashboard />);

  await waitFor(() => {
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
  });
});
```

---

## Deployment

### Docker Compose

Add dashboard frontend service:
```yaml
dashboard-ui:
  build: ./dashboard
  ports:
    - "3002:80"
  environment:
    REACT_APP_API_URL: http://gateway:3000
  depends_on:
    - gateway
```

### Kubernetes

Create separate deployment for dashboard UI:
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: dashboard-ui
spec:
  replicas: 2
  template:
    spec:
      containers:
      - name: dashboard
        image: llm-firewall-dashboard:latest
        ports:
        - containerPort: 80
```

---

## Summary

**Phase 5.3 Status:** ✅ API SPECIFICATION COMPLETE

- ✅ 6 REST API endpoints specified
- ✅ WebSocket for real-time updates (spec)
- ✅ Authentication & authorization design
- ✅ Frontend component architecture
- ✅ Security & performance considerations
- ✅ Testing strategy
- ✅ Deployment guide

**Implementation:** Backend routes and frontend can be built using this specification.

**Estimated Effort:**
- Backend API implementation: 4-6 hours
- Frontend dashboard UI: 12-16 hours
- Testing & polish: 4-6 hours
