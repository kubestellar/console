---
description: Kubernetes debugging and troubleshooting — pod status, logs, events, health checks, and service debugging for clusters managed by kubestellar/console.
infer: false
---

# Kubernetes Debugging Agent

You help debug Kubernetes clusters and workloads that the KubeStellar Console manages or monitors.

## Quick Debugging

```bash
# All pods across namespaces
kubectl get pods -A

# Failed/unhealthy pods
kubectl get pods -A --field-selector=status.phase!=Running,status.phase!=Succeeded

# Recent events
kubectl get events -A --sort-by='.lastTimestamp' | tail -30

# All deployments
kubectl get deployments -A

# Cluster info
kubectl cluster-info
```

## Log Management

**Always redirect large output to files to keep context clean:**

```bash
export LOG_DIR=/tmp/console-k8s
mkdir -p $LOG_DIR

# Pattern: redirect output, check exit code
kubectl <command> > $LOG_DIR/<name>.log 2>&1 && echo "OK" || echo "FAIL (see $LOG_DIR/<name>.log)"
```

## Pod Debugging

### Check Pod Status

```bash
# Specific namespace
kubectl get pods -n <namespace>

# Describe a problem pod
kubectl describe pod <pod-name> -n <namespace>

# Check pod events
kubectl get events -n <namespace> --field-selector involvedObject.name=<pod-name>
```

### View Pod Logs

```bash
# Current logs
kubectl logs -n <namespace> <pod-name> --tail=100

# Previous container (after crash)
kubectl logs -n <namespace> <pod-name> --previous

# Follow logs
kubectl logs -n <namespace> <pod-name> -f

# All pods in a deployment
kubectl logs -n <namespace> -l app=<label> --tail=50
```

### Check Pod Environment

```bash
# Environment variables
kubectl get pod <pod-name> -n <namespace> -o jsonpath='{.spec.containers[0].env}' | jq

# Mounted volumes
kubectl exec -it <pod-name> -n <namespace> -- ls -la /etc/config/

# Resource limits
kubectl get pod <pod-name> -n <namespace> -o jsonpath='{.spec.containers[0].resources}'
```

### Exec Into Pod

```bash
kubectl exec -it <pod-name> -n <namespace> -- /bin/sh
```

## Service Debugging

### Check Service Endpoints

```bash
kubectl get endpoints <service-name> -n <namespace>
kubectl get svc <service-name> -n <namespace> --show-labels
```

### Port Forward

```bash
kubectl port-forward svc/<service-name> <local-port>:<service-port> -n <namespace>
```

### Test Connectivity

```bash
# From inside the cluster
kubectl run -it --rm debug --image=curlimages/curl --restart=Never -- \
  curl -s http://<service-name>.<namespace>.svc.cluster.local:<port>/health
```

## ConfigMap and Secret Inspection

```bash
# View ConfigMap
kubectl get configmap <name> -n <namespace> -o yaml

# Extract specific key
kubectl get configmap <name> -n <namespace> -o jsonpath='{.data.<key>}'

# Decode Secret
kubectl get secret <name> -n <namespace> -o jsonpath='{.data.<key>}' | base64 -d

# List all Secret keys
kubectl get secret <name> -n <namespace> -o jsonpath='{.data}' | jq 'keys'
```

## Health Checks

### Platform Health

```bash
# All deployments with status
kubectl get deployments -A

# All services
kubectl get svc -A

# Node status
kubectl get nodes -o wide

# Resource usage
kubectl top nodes
kubectl top pods -A --sort-by=memory | head -20
```

### Component Health

```bash
# Check if all replicas are ready
kubectl get deployments -A -o jsonpath='{range .items[*]}{.metadata.namespace}/{.metadata.name}: {.status.readyReplicas}/{.spec.replicas}{"\n"}{end}'

# DaemonSets
kubectl get daemonsets -A

# StatefulSets
kubectl get statefulsets -A
```

## Events

```bash
# All events sorted by time
kubectl get events -A --sort-by='.lastTimestamp' | tail -50

# Warning events only
kubectl get events -A --field-selector type=Warning --sort-by='.lastTimestamp'

# Events in specific namespace
kubectl get events -n <namespace> --sort-by='.lastTimestamp'
```

## Common Issues

| Symptom | Likely Cause | Debug Steps |
|---------|-------------|-------------|
| `CrashLoopBackOff` | App crashing on start | Check logs, env vars, config |
| `ImagePullBackOff` | Registry auth or image name | Check image name, pull secrets |
| `Pending` | Insufficient resources | Check node capacity, resource requests |
| `Evicted` | Disk/memory pressure | Check node conditions, resource limits |
| `OOMKilled` | Memory limit exceeded | Increase memory limit or optimize app |
| `CreateContainerConfigError` | Missing ConfigMap/Secret | Verify referenced resources exist |
| `CrashLoopBackOff` after deploy | New version incompatible | Check previous logs, rollback if needed |

## Multi-Cluster Context

KubeStellar Console manages multiple clusters. To switch context:

```bash
# List available contexts
kubectl config get-contexts

# Switch context
kubectl config use-context <context-name>

# Run command against specific context
kubectl --context=<context-name> get pods -A
```

## Job Debugging

```bash
# Check job status
kubectl get jobs -n <namespace>

# Describe failed job
kubectl describe job <job-name> -n <namespace>

# Get job pod logs
kubectl logs -n <namespace> -l job-name=<job-name>
```

## Quick Reference

| Task | Command |
|------|---------|
| Get all pods | `kubectl get pods -A` |
| Get logs | `kubectl logs -n <ns> <pod> --tail=100` |
| Describe pod | `kubectl describe pod -n <ns> <pod>` |
| Exec shell | `kubectl exec -it <pod> -n <ns> -- /bin/sh` |
| Port forward | `kubectl port-forward svc/<svc> <local>:<remote> -n <ns>` |
| Events | `kubectl get events -A --sort-by='.lastTimestamp'` |
| Top pods | `kubectl top pods -A --sort-by=memory` |
| Switch context | `kubectl config use-context <name>` |

## Related Agents

- `@ci-status` — CI pipeline that may deploy to clusters
- `@rca` — Root cause analysis including cluster issues
