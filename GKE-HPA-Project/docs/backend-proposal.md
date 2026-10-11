# Backend Telemetry API Architecture & Proposal

## 1. Executive Summary & Security Isolation Principle

In a cloud-native architecture, a browser-based frontend cannot and must never interact directly with the Kubernetes Control Plane API (`https://kubernetes.default.svc`). 

### Why Browser JavaScript Cannot Query the Kubernetes API Directly:
1. **Credential Exposure Risk:** Embedding a Kubernetes ServiceAccount bearer token or client certificate in client-side JavaScript exposes the token to anyone using browser developer tools, presenting an immediate security vulnerability.
2. **CORS & Certificate Restrictions:** The Kubernetes API server does not permit arbitrary Cross-Origin Resource Sharing (CORS) from web browsers and requires the internal cluster Certificate Authority (`ca.crt`) which standard browsers do not trust.
3. **Privilege Isolation:** Client-side JavaScript cannot run arbitrary shell commands (such as `kubectl run load-generator` or `stress-ng`). Executing shell commands from an unauthenticated browser interface introduces Remote Code Execution (RCE) vulnerabilities.

### The Solution: Dedicated In-Cluster Telemetry Proxy
The frontend must interact with a lightweight backend proxy running inside the cluster. The backend queries the Kubernetes API and the Metrics Server using an isolated, least-privilege `ServiceAccount` and serves sanitized JSON to the frontend.

---

## 2. Architecture Overview

```
[ Browser Client ]
        │  (HTTP / GET)
        ▼
[ NGINX Frontend Pod ] ──(Reverse Proxy /api)──► [ Telemetry Backend Service ]
                                                          │  (In-Cluster ServiceAccount)
                                                          ▼
                                            [ Kubernetes API & Metrics Server ]
                                                  ├─ pods (read-only)
                                                  ├─ deployments (read-only)
                                                  ├─ hpa (read-only)
                                                  └─ metrics.k8s.io (read-only)
```

---

## 3. Least-Privilege Kubernetes RBAC Specification

The backend service runs under a dedicated `ServiceAccount` bound to a strictly read-only `Role` scoped only to the application namespace.

### `k8s/backend-rbac.yaml` (Proposed Manifest)

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: gke-hpa-monitor-backend-sa
  namespace: default
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: gke-hpa-monitor-reader-role
  namespace: default
rules:
  # Read-only access to Pods and Deployments
  - apiGroups: [""]
    resources: ["pods"]
    verbs: ["get", "list", "watch"]
  - apiGroups: ["apps"]
    resources: ["deployments"]
    verbs: ["get", "list", "watch"]
  # Read-only access to Autoscaling APIs
  - apiGroups: ["autoscaling"]
    resources: ["horizontalpodautoscalers"]
    verbs: ["get", "list", "watch"]
  # Read-only access to Kubernetes Events
  - apiGroups: [""]
    resources: ["events"]
    verbs: ["get", "list", "watch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: gke-hpa-monitor-reader-binding
  namespace: default
subjects:
  - kind: ServiceAccount
    name: gke-hpa-monitor-backend-sa
    namespace: default
roleRef:
  kind: Role
  name: gke-hpa-monitor-reader-role
  apiGroup: rbac.authorization.k8s.io
```

---

## 4. Proposed REST API Specifications

The backend exposes the following endpoints under `/api`:

### 1. `GET /api/cluster/status`
Returns high-level health and summary numbers for the Dashboard Overview.
```json
{
  "status": "healthy",
  "connected": true,
  "clusterType": "GKE Standard",
  "namespace": "default",
  "hpa": {
    "name": "gke-hpa-monitor-hpa",
    "targetDeployment": "gke-hpa-monitor",
    "currentReplicas": 4,
    "desiredReplicas": 4,
    "currentCpuPercent": 48,
    "targetCpuPercent": 50,
    "minReplicas": 2,
    "maxReplicas": 10,
    "condition": "AbleToScale"
  }
}
```

### 2. `GET /api/pods`
Returns pod metrics aggregated from `metrics.k8s.io` and the core Pod API.
```json
{
  "pods": [
    {
      "name": "gke-hpa-monitor-7b8f94d84-c8vx2",
      "status": "Running",
      "ready": "1/1",
      "cpu": "24m (24%)",
      "mem": "34 MiB",
      "restarts": 0,
      "ip": "10.244.1.18"
    }
  ]
}
```

### 3. `GET /api/metrics/history`
Returns a rolling 15-minute time series of averaged CPU and Memory values for chart plotting.
```json
{
  "timestamps": ["10m ago", "8m ago", "6m ago", "4m ago", "2m ago", "Just now"],
  "cpuPercentages": [15, 18, 42, 78, 65, 48],
  "memoryMiB": [30, 31, 33, 38, 36, 35]
}
```

### 4. `POST /api/workload/generate-load`
Triggers bounded in-cluster synthetic HTTP queries using an internal goroutine/worker rather than executing untrusted shell commands.
```json
{
  "durationSeconds": 60,
  "concurrency": 15
}
```
**Response (HTTP 200 OK):**
```json
{
  "status": "started",
  "message": "Generating synthetic HTTP traffic against http://gke-hpa-monitor-service:80 for 60s"
}
```

---

## 5. Implementation Recommendations (Go / Node.js)

A lightweight Go service using the official `k8s.io/client-go` SDK or Node.js with `@kubernetes/client-node` is recommended:
- **Binary Size:** < 20MB using multi-stage Scratch/Alpine Docker builds.
- **Memory Footprint:** ~15MiB RAM.
- **Security:** Run as non-root user (`USER 10001`), read-only root filesystem, drop all Linux capabilities (`drop: ["ALL"]`).
