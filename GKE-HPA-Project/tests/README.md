# Testing Horizontal Pod Autoscaling (HPA)

This directory contains instructions for load-testing the HPA configuration. Once your application and HPA are deployed, you can verify that autoscaling works by generating artificial CPU load.

## 1. Verify Initial State
Before applying load, check the current state of your Deployment and HPA:

```bash
# Check the number of running pods (should be 2 initially)
kubectl get pods

# Check HPA status and current CPU utilization
kubectl get hpa gke-hpa-monitor-hpa --watch
```

## 2. Generate CPU Load
To simulate traffic and spike CPU utilization, we can run a temporary busybox pod in the cluster that continuously requests the application via `wget`.

Open a **new terminal window** and run the following command to start the load generator:

```bash
kubectl run -i --tty load-generator --rm --image=busybox:1.28 --restart=Never -- /bin/sh -c "while sleep 0.01; do wget -q -O- http://gke-hpa-monitor-service; done"
```

*Note: Keep this terminal open to maintain the load.*

## 3. Observe Scale-Up Behavior
Go back to the terminal where you are watching the HPA (`kubectl get hpa --watch`):
- You will see the `TARGETS` CPU utilization percentage increase (e.g., from `1%/50%` to `150%/50%`).
- As the target is exceeded, the `REPLICAS` count will increase from `2` up to a maximum of `10`.
- You can also watch the pods spinning up in another terminal:
  ```bash
  kubectl get pods -w
  ```

## 4. Observe Scale-Down Behavior
Once you have verified the scale-up:
1. Go to the terminal running the `load-generator` and press `Ctrl+C` to stop it.
2. Continue watching the HPA status.
3. The CPU utilization will drop to nearly 0%.
4. **Note:** HPA has a built-in cooldown/stabilization period (typically ~5 minutes) for scaling down to prevent thrashing. Wait a few minutes, and you will see the replica count gradually decrease back to the minimum of `2`.

## 5. Check HPA Events
To understand the scaling decisions made by Kubernetes, inspect the HPA events:
```bash
kubectl describe hpa gke-hpa-monitor-hpa
```
Look at the `Events:` section at the bottom for messages about `SuccessfulRescale`.
