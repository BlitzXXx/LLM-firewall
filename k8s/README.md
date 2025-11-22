# Kubernetes Deployment Guide

This directory contains production-ready Kubernetes manifests for deploying the LLM Firewall stack.

## 📋 Prerequisites

- Kubernetes cluster (1.24+)
- kubectl configured
- Sufficient cluster resources:
  - 6 CPU cores minimum
  - 8GB RAM minimum
  - 70GB persistent storage
- Container images built and pushed to registry

## 🚀 Quick Start

### 1. Build and Push Docker Images

```bash
# Build Gateway image
cd gateway
docker build -t your-registry/llm-firewall-gateway:latest .
docker push your-registry/llm-firewall-gateway:latest

# Build Analyzer image
cd ../analyzer
docker build -t your-registry/llm-firewall-analyzer:latest .
docker push your-registry/llm-firewall-analyzer:latest
```

### 2. Update Image References

Edit the deployment files to use your registry:
- `k8s/gateway-deployment.yaml` - Update `image:` field
- `k8s/analyzer-deployment.yaml` - Update `image:` field

### 3. Create Secrets

```bash
# Create secrets (CHANGE THESE VALUES!)
kubectl create secret generic llm-firewall-secrets \
  --namespace llm-firewall \
  --from-literal=POSTGRES_USER=firewall \
  --from-literal=POSTGRES_PASSWORD=CHANGE_THIS_PASSWORD \
  --from-literal=OPENAI_API_KEY=sk-your-key-here \
  --from-literal=ANTHROPIC_API_KEY=sk-ant-your-key-here \
  --from-literal=GRAFANA_ADMIN_USER=admin \
  --from-literal=GRAFANA_ADMIN_PASSWORD=CHANGE_THIS_PASSWORD
```

### 4. Deploy All Resources

```bash
# Apply manifests in order
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/rbac.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secret.yaml
kubectl apply -f k8s/postgres-statefulset.yaml
kubectl apply -f k8s/redis-statefulset.yaml
kubectl apply -f k8s/analyzer-deployment.yaml
kubectl apply -f k8s/analyzer-service.yaml
kubectl apply -f k8s/gateway-deployment.yaml
kubectl apply -f k8s/gateway-service.yaml
```

Or apply all at once:
```bash
kubectl apply -f k8s/
```

### 5. Verify Deployment

```bash
# Check pod status
kubectl get pods -n llm-firewall

# Check services
kubectl get svc -n llm-firewall

# Check persistent volumes
kubectl get pvc -n llm-firewall

# Check logs
kubectl logs -n llm-firewall -l component=gateway --tail=50
kubectl logs -n llm-firewall -l component=analyzer --tail=50
```

## 📊 Resource Overview

### Deployments

| Component | Replicas | CPU Request | Memory Request | CPU Limit | Memory Limit |
|-----------|----------|-------------|----------------|-----------|--------------|
| Gateway   | 3        | 500m        | 512Mi          | 1000m     | 1Gi          |
| Analyzer  | 2-10*    | 1000m       | 2Gi            | 2000m     | 4Gi          |
| Redis     | 1        | 250m        | 128Mi          | 500m      | 256Mi        |
| PostgreSQL| 1        | 500m        | 256Mi          | 1000m     | 512Mi        |

*Auto-scales based on CPU/Memory usage (HPA)

### Storage

| Component  | Volume Size | Access Mode      | Purpose         |
|------------|-------------|------------------|-----------------|
| Redis      | 10Gi        | ReadWriteOnce    | Rate limit data |
| PostgreSQL | 50Gi        | ReadWriteOnce    | Audit logs      |

## 🔧 Configuration

### Environment Variables

Edit `k8s/configmap.yaml` to customize:

- **Security**: `MIN_CONTENT_LENGTH`, `MAX_CONTENT_LENGTH`, `PII_CONFIDENCE_THRESHOLD`
- **Rate Limiting**: `RATE_LIMIT_GLOBAL`, `RATE_LIMIT_PER_IP`, `RATE_LIMIT_PER_API_KEY`
- **Observability**: `LOG_LEVEL`, `OBSERVABILITY_ENABLED`

### Secrets

Edit `k8s/secret.yaml` or use kubectl to manage:

```bash
# Update API key
kubectl create secret generic llm-firewall-secrets \
  --namespace llm-firewall \
  --from-literal=OPENAI_API_KEY=sk-new-key \
  --dry-run=client -o yaml | kubectl apply -f -

# Restart pods to pick up new secrets
kubectl rollout restart deployment/gateway -n llm-firewall
```

### Horizontal Pod Autoscaling

Analyzer service auto-scales 2-10 replicas based on:
- CPU > 70%
- Memory > 80%

Configure in `k8s/analyzer-deployment.yaml` (HPA section).

## 🔍 Monitoring

### Health Checks

```bash
# Gateway health
kubectl exec -it -n llm-firewall deploy/gateway -- curl localhost:3000/health

# Analyzer health
kubectl exec -it -n llm-firewall deploy/analyzer -- grpc_health_probe -addr=:50051
```

### Logs

```bash
# Stream logs
kubectl logs -f -n llm-firewall -l component=gateway
kubectl logs -f -n llm-firewall -l component=analyzer

# Previous pod logs (if crashed)
kubectl logs -n llm-firewall -l component=gateway --previous
```

### Metrics

If Prometheus is installed in cluster:

```bash
# Port-forward to access metrics
kubectl port-forward -n llm-firewall svc/gateway-service 3000:80
curl http://localhost:3000/metrics
```

## 📈 Scaling

### Manual Scaling

```bash
# Scale Gateway
kubectl scale deployment gateway -n llm-firewall --replicas=5

# Scale Analyzer (overrides HPA)
kubectl scale deployment analyzer -n llm-firewall --replicas=5
```

### Auto-scaling

Analyzer uses HPA (configured in deployment):

```bash
# View HPA status
kubectl get hpa -n llm-firewall

# Describe HPA
kubectl describe hpa analyzer-hpa -n llm-firewall
```

## 🔄 Rolling Updates

### Update Image

```bash
# Update Gateway
kubectl set image deployment/gateway gateway=your-registry/llm-firewall-gateway:v2.0.0 -n llm-firewall

# Update Analyzer
kubectl set image deployment/analyzer analyzer=your-registry/llm-firewall-analyzer:v2.0.0 -n llm-firewall

# Check rollout status
kubectl rollout status deployment/gateway -n llm-firewall
```

### Rollback

```bash
# Rollback to previous version
kubectl rollout undo deployment/gateway -n llm-firewall

# Rollback to specific revision
kubectl rollout undo deployment/gateway -n llm-firewall --to-revision=2
```

## 🗑️ Cleanup

```bash
# Delete all resources
kubectl delete namespace llm-firewall

# Or delete individual resources
kubectl delete -f k8s/
```

**Warning**: This will delete all data including persistent volumes!

## 🔒 Security Best Practices

1. **Use External Secrets Manager**
   - Replace `k8s/secret.yaml` with AWS Secrets Manager, HashiCorp Vault, etc.
   - Use External Secrets Operator

2. **Network Policies**
   - Add NetworkPolicy resources to restrict pod-to-pod communication
   - Example: Only allow Gateway → Analyzer traffic

3. **Pod Security**
   - Enable Pod Security Standards (restricted)
   - Use SecurityContext (already configured)
   - Run as non-root (already configured)

4. **Resource Limits**
   - All pods have resource limits to prevent resource exhaustion
   - Adjust based on your workload

5. **Image Security**
   - Scan images with Trivy/Snyk
   - Use specific version tags (not `:latest`)
   - Pull from private registries

## 🌐 Exposing to Internet

### Option 1: LoadBalancer (Cloud Provider)

Already configured in `gateway-service.yaml`. Get external IP:

```bash
kubectl get svc gateway-service -n llm-firewall
```

### Option 2: Ingress

Create an Ingress resource:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: llm-firewall-ingress
  namespace: llm-firewall
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  ingressClassName: nginx
  tls:
  - hosts:
    - firewall.yourdomain.com
    secretName: firewall-tls
  rules:
  - host: firewall.yourdomain.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: gateway-service
            port:
              number: 80
```

## 📞 Troubleshooting

### Pods Not Starting

```bash
# Describe pod to see events
kubectl describe pod -n llm-firewall <pod-name>

# Check logs
kubectl logs -n llm-firewall <pod-name>
```

### Database Connection Issues

```bash
# Check PostgreSQL is running
kubectl get pods -n llm-firewall -l component=postgres

# Test connection from Gateway pod
kubectl exec -it -n llm-firewall deploy/gateway -- sh
# Then inside pod:
# nc -zv postgres-service 5432
```

### Redis Connection Issues

```bash
# Check Redis is running
kubectl get pods -n llm-firewall -l component=redis

# Test connection
kubectl exec -it -n llm-firewall deploy/gateway -- sh
# nc -zv redis-service 6379
```

## 📚 Additional Resources

- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [Horizontal Pod Autoscaler](https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/)
- [StatefulSets](https://kubernetes.io/docs/concepts/workloads/controllers/statefulset/)
- [Persistent Volumes](https://kubernetes.io/docs/concepts/storage/persistent-volumes/)
