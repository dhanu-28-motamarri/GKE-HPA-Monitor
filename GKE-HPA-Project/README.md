# GKE Cluster with Horizontal Pod Autoscaling

[![Kubernetes](https://img.shields.io/badge/Kubernetes-v1.28%2B-blue?logo=kubernetes)](https://kubernetes.io/)
[![GKE](https://img.shields.io/badge/GCP-GKE%20Standard-4285F4?logo=google-cloud)](https://cloud.google.com/kubernetes-engine)
[![NGINX](https://img.shields.io/badge/Server-NGINX%20Alpine-009639?logo=nginx)](https://nginx.org/)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

An end-to-end college cloud computing demonstration project featuring a containerized web application deployed to **Google Kubernetes Engine (GKE)** and local **Minikube** clusters with **Horizontal Pod Autoscaling (HPA)** based on CPU utilization.

---

## 1. Project Architecture

The architecture demonstrates a scalable, highly available Kubernetes deployment adhering to production best practices:

```
[ External User / Client ]
           │
           ▼
[ Kubernetes Service: LoadBalancer ] (Port 80)
           │
     ┌─────┴──────────────────────┐ (Round-Robin Traffic)
     ▼                            ▼
[ Pod: gke-hpa-monitor-1 ]  [ Pod: gke-hpa-monitor-2 ]  ... [ Pod: N (up to 10) ]
  (100m CPU Req, 128Mi RAM)   (100m CPU Req, 128Mi RAM)
     │                            │
     └─────────────┬──────────────┘
                   ▼ (cAdvisor Node Telemetry)
         [ Metrics Server ]
                   │
                   ▼ (Metric Query via autoscaling/v2)
    [ Horizontal Pod Autoscaler (HPA) ]
                   │
                   ▼ (Updates spec.replicas: 2 to 10)
    [ Kubernetes Deployment Controller ]
```

### Key Architectural Components:
1. **Frontend Workload (`app/`):** High-performance, responsive HTML5/CSS/Vanilla JavaScript monitoring dashboard served via lightweight **NGINX on Alpine Linux**.
2. **Kubernetes Deployment (`k8s/deployment.yaml`):** Manages pod lifecycle with resource requests (`100m` CPU, `128Mi` RAM) and limits (`250m` CPU, `256Mi` RAM), coupled with HTTP liveness and readiness health checks.
3. **Kubernetes Service (`k8s/service.yaml`):** Exposes application pods via a cloud `LoadBalancer` (or `NodePort`/Tunnel on Minikube).
4. **Horizontal Pod Autoscaler (`k8s/hpa.yaml`):** Evaluates CPU utilization against a **50% target threshold**, scaling replicas between **2 (min)** and **10 (max)**.
5. **Metrics Server:** Cluster add-on providing resource metrics via the `metrics.k8s.io` API.

---

## 2. Dashboard Observability Features

The upgraded dashboard provides a complete observability console with a dark navy & blue theme:

1. **Dashboard Overview:** Displays application health, cluster connection status, current pod count, desired replicas, minimum/maximum boundaries, and target CPU.
2. **Pod Monitoring Table:** Shows individual pod instances, readiness (`1/1`), container status badges, CPU & memory footprint, restart counts, and node IPs.
3. **HPA Controller Status:** Visual progress gauge comparing active CPU utilization against the 50% target, current/desired replica counts, and autoscale condition state.
4. **Resource Charts:** Responsive, dependency-free HTML5 Canvas charts rendering CPU utilization and memory footprint time-series with threshold indicators and clear empty states.
5. **Scaling Events Log:** Timeline recording `ScaleUp` and `ScaleDown` controller events, timestamp transitions (e.g. `2 → 4 pods`), and rescale justifications.
6. **Workload Testing Panel:** Security-isolated interface providing one-click copyable CLI commands (`kubectl run load-generator`) and a safe backend trigger hook.
7. **Cluster Architecture:** Interactive visual topology of User, Service, Deployment, Pods, Metrics Server, and HPA.
8. **Deployment Spec:** Quick-reference inspection cards for Kubernetes manifest definitions.
9. **Core Concepts:** Academic explanations of GKE, Kubernetes Pods, and HPA autoscaling formulas.

> [!NOTE]
> **Data Integrity & Security:** Browser JavaScript cannot and does not execute raw shell commands, nor does it display static values as fake live metrics. When running without the optional backend proxy, the UI shows transparent empty states and offers a dedicated **"Sample Data Mode"** toggle in the header for previewing dynamic visualizations.

---

## 3. Repository Structure

```
GKE-HPA-Project/
├── app/
│   ├── index.html          # Upgraded multi-section observability dashboard
│   ├── style.css           # Modern dark navy/blue theme, glassmorphism, responsive
│   └── script.js           # Chart engine, telemetry state management, sample mode
├── docker/                 # Container assets and auxiliary configs
├── docs/
│   └── backend-proposal.md # In-cluster backend proxy and RBAC specification
├── k8s/
│   ├── deployment.yaml     # Kubernetes Deployment (2 replicas, CPU/mem limits, probes)
│   ├── service.yaml        # Kubernetes LoadBalancer Service (Port 80)
│   └── hpa.yaml            # HPA configuration (autoscaling/v2, 50% CPU target, 2-10 pods)
├── tests/
│   └── README.md           # Step-by-step CPU load-testing and verification guide
├── Dockerfile              # Production multi-stage NGINX container build file
└── README.md               # Main project documentation
```

---

## 4. Prerequisites

- **Docker:** Installed and running locally ([Docker Desktop](https://www.docker.com/products/docker-desktop/)).
- **kubectl:** Kubernetes CLI ([kubectl install guide](https://kubernetes.io/docs/tasks/tools/)).
- **For Local Testing:** [Minikube](https://minikube.sigs.k8s.io/docs/start/).
- **For Cloud Deployment:** Google Cloud SDK ([gcloud CLI](https://cloud.google.com/sdk/docs/install)) and an active GCP Project with billing enabled.

---

## 5. Local Deployment Guide (Minikube)

You can run and test the complete autoscaling pipeline locally on Minikube before deploying to Google Cloud.

### Step 1: Start Minikube & Enable Metrics Server
Horizontal Pod Autoscaling requires the Metrics Server to collect CPU metrics:
```bash
# Start Minikube with sufficient resources
minikube start --cpus=4 --memory=4096

# Crucial: Enable the metrics-server add-on
minikube addons enable metrics-server

# Verify metrics-server is running
kubectl get pods -n kube-system -l k8s-app=metrics-server
```

### Step 2: Build the Docker Image inside Minikube
To allow Minikube to access the image without pushing to a remote registry, point your terminal to Minikube's Docker daemon:

**On Linux / macOS:**
```bash
eval $(minikube docker-env)
docker build -t gke-hpa-monitor-image:latest .
```

**On Windows (PowerShell):**
```powershell
& minikube -p minikube docker-env --shell powershell | Invoke-Expression
docker build -t gke-hpa-monitor-image:latest .
```

### Step 3: Deploy Kubernetes Manifests
Apply the Deployment, Service, and HPA:
```bash
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/hpa.yaml
```

### Step 4: Access the Frontend
On Minikube, open the service tunnel in your default browser:
```bash
minikube service gke-hpa-monitor-service
```

---

## 6. Google Cloud (GKE) Deployment Guide

### Step 1: Authenticate and Configure GCP
```bash
export PROJECT_ID="your-gcp-project-id"
export REGION="us-central1"
export CLUSTER_NAME="gke-hpa-cluster"

gcloud auth login
gcloud config set project $PROJECT_ID
```

### Step 2: Create a GKE Standard Cluster
```bash
gcloud container clusters create $CLUSTER_NAME \
    --region=$REGION \
    --num-nodes=2 \
    --machine-type=e2-standard-2 \
    --enable-autoscaling --min-nodes=2 --max-nodes=4

# Connect kubectl to your new cluster
gcloud container clusters get-credentials $CLUSTER_NAME --region=$REGION
```

### Step 3: Build & Push Image to Google Artifact Registry
```bash
# Create Docker repository in Artifact Registry
gcloud artifacts repositories create gke-repo \
    --repository-format=docker \
    --location=$REGION \
    --description="GKE HPA Docker repository"

# Configure Docker credentials
gcloud auth configure-docker ${REGION}-docker.pkg.dev

# Tag and push image
export IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT_ID}/gke-repo/gke-hpa-monitor-image:latest"
docker build -t $IMAGE_URI .
docker push $IMAGE_URI
```

### Step 4: Update Deployment Image & Apply Manifests
Open [`k8s/deployment.yaml`](k8s/deployment.yaml) and set `spec.template.spec.containers[0].image` to your `$IMAGE_URI`.

Apply the manifests:
```bash
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/hpa.yaml
```

### Step 5: Access Public IP
```bash
kubectl get service gke-hpa-monitor-service --watch
```
Once the `EXTERNAL-IP` transitions from `<pending>` to a public IP address, open `http://<EXTERNAL-IP>` in your browser.

---

## 7. Testing Horizontal Pod Autoscaling

To generate load and observe scaling in action:

1. **Watch the HPA in Terminal 1:**
   ```bash
   kubectl get hpa gke-hpa-monitor-hpa --watch
   ```
2. **Watch the Pods in Terminal 2:**
   ```bash
   kubectl get pods -l app=gke-hpa-monitor -w
   ```
3. **Launch the Load Generator in Terminal 3:**
   ```bash
   kubectl run -i --tty load-generator --rm --image=busybox:1.28 --restart=Never -- /bin/sh -c "while sleep 0.01; do wget -q -O- http://gke-hpa-monitor-service; done"
   ```
4. **Observe Scaling Behavior:**
   - **Scale-Up:** CPU utilization will climb above `50%`. The HPA controller will scale the pod count from `2` up towards `10`.
   - **Scale-Down:** Terminate the load generator with <kbd>Ctrl+C</kbd>. After the default ~5-minute stabilization cooldown, the HPA will scale the replicas back down to `2`.

Detailed testing troubleshooting and commands are available in [`tests/README.md`](tests/README.md).

---

## 8. Cleanup

To prevent incurring unnecessary cloud charges:
```bash
# Delete Kubernetes resources
kubectl delete -f k8s/

# Delete GKE cluster (if on Google Cloud)
gcloud container clusters delete $CLUSTER_NAME --region=$REGION --quiet

# Delete Artifact Registry repository
gcloud artifacts repositories delete gke-repo --location=$REGION --quiet
```
