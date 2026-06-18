# KubeStellar Console Mission Library (console-kb)

## 188 CNCF Project Mission Sets — Guided Operational Runbooks

The KubeStellar Console mission library (`console-kb`) contains **188 AI-powered guided runbooks** covering the breadth of the CNCF ecosystem. These missions enable operators to troubleshoot, configure, and manage Kubernetes projects with step-by-step guidance.

## What is a Mission?

A mission is an interactive, AI-driven operational runbook. Example missions:

- **ArgoCD**: Diagnose sync failures, fix application drift, recover from cluster state divergence
- **Prometheus**: Configure scrape targets, debug missing metrics, optimize cardinality
- **Istio**: Troubleshoot traffic routing, debug mTLS failures, analyze circuit breaker behavior
- **Kyverno**: Validate policy violations, audit RBAC drift, enforce security policies
- **OTel**: Configure instrumentation, correlate traces with logs, debug metric collection
- **Longhorn**: Recover failed volumes, resize persistent volumes, debug replication

## Mission Counts by Project

Over 100 CNCF projects have guided missions:

| Project | Mission Sets |
|---------|--------------|
| ArgoCD | 12 |
| Prometheus | 11 |
| Istio | 10 |
| Kyverno | 9 |
| OpenTelemetry | 8 |
| Flux | 8 |
| Kubernetes Core | 15 |
| Helm | 6 |
| Velero | 6 |
| **...and 90+ more** | **~88** |
| **TOTAL** | **188** |

## How to Access Missions

### In KubeStellar Console

1. Open the console dashboard
2. Navigate to **Missions** in the sidebar
3. Browse or search for your project
4. Select a mission to begin

### Via API

```bash
# Get all missions
curl https://console.kubestellar.io/api/missions/browse | jq

# Get missions for a specific project
curl https://console.kubestellar.io/api/missions/browse?project=prometheus | jq

# Fetch a mission file
curl https://console.kubestellar.io/api/missions/file?id=prometheus-scrape-targets
```

### Demo Mode

Missions are available in demo mode (no cluster required):

```bash
./start-dev.sh
# Navigate to Missions → ArgoCD → Sync Failure Recovery
```

## Using a Mission

Missions are interactive:

1. **Start** — The AI reads your cluster state (logs, metrics, resources)
2. **Analyze** — The agent diagnoses the issue
3. **Guide** — Step-by-step remediation with context-specific commands
4. **Verify** — Automatic verification that the fix worked

Example flow:

```
Mission: ArgoCD Application Sync Failure

Step 1: Read cluster state
  ✓ Fetched ArgoCD Application resource
  ✓ Checked controller logs
  ✓ Analyzed sync history

Step 2: Identify root cause
  ❌ Helm chart not found in repository
     Repository: ghcr.io/myorg/charts
     Chart: myapp v2.5.0
  
Step 3: Resolve
  → Update Application spec:
      helm:
        repoURL: ghcr.io/myorg/charts
        chart: myapp
        targetRevision: v2.5.0

Step 4: Verify
  ✓ Application synced successfully
  ✓ All pods are healthy
```

## Contribution Opportunities

### Creating New Missions

Missions are written in YAML + Go templates. To contribute:

1. **Propose** a new mission in a GitHub issue
2. **Write** the mission file in `console-kb/missions/`
3. **Test** with a live cluster
4. **Submit** a PR with test results

Example mission skeleton:

```yaml
# missions/nginx-ingress-debug.yaml
apiVersion: missions.kubestellar.io/v1alpha1
kind: Mission
metadata:
  name: nginx-ingress-debug
  project: nginx-ingress
  tags: [troubleshooting, networking]
spec:
  title: "Debug NGINX Ingress Controller Issues"
  description: "Diagnose and resolve NGINX Ingress routing problems"
  steps:
    - name: read-state
      action: readCluster
      resources:
        - ingresses
        - services
        - endpoints
    - name: analyze
      action: agent
      prompt: |
        Analyze the ingress resources and identify why traffic is not routing correctly.
        Look for: mismatched selectors, missing backend services, certificate issues.
    - name: guide
      action: guidedRemediaton
      checkpoints:
        - verify_selector_match
        - verify_service_exists
        - verify_tls_certificate
```

### Improving Existing Missions

- Simplify steps for clarity
- Add more project coverage
- Improve AI prompts for better diagnostics
- Add verification checks

## FAQ

### Do I need a live cluster?

No. Missions work in demo mode with sample data. For production troubleshooting, connect your cluster.

### Can missions access my cluster data?

Only if you configure cluster access in the console settings. All operations are audit-logged.

### Are missions RBAC-aware?

Yes. Missions respect your Kubernetes RBAC permissions. If you can't run `kubectl delete pod`, the mission won't either.

### How often are missions updated?

Missions are updated with each CNCF project release. Subscribe to mission updates in the console settings.

## Community Resources

- 📖 [Mission Writing Guide](./mission-development-guide.md)
- 💬 [Slack: #kubestellar](https://slack.cncf.io/)
- 🐛 [Issues: kubestellar/console](https://github.com/kubestellar/console/issues)
- 🚀 [KubeCon Talk: Guided Runbooks for the CNCF Ecosystem](https://kubecon.io)

## Featured Missions by CNCF Project

Each major CNCF project has 5-15 guided missions:

- **Cluster Management:** Kubernetes, Kubeadm, KubeEdge
- **Observability:** Prometheus, Grafana, Jaeger, OTel
- **Service Mesh:** Istio, Linkerd, Consul
- **GitOps:** ArgoCD, Flux, KubeVela
- **Policy & Governance:** Kyverno, OPA/Gatekeeper
- **Security:** Falco, Vault, cert-manager
- **Storage:** Longhorn, Rook, OpenEBS
- **Networking:** NGINX Ingress, Cilium, Calico
- **CI/CD:** Tekton, Argo Workflows, Jenkins X

And 90+ more...

## Getting Started

1. **Browse missions** at console.kubestellar.io/missions
2. **Try one** in demo mode (no cluster needed)
3. **Connect your cluster** for live guidance
4. **Contribute** new missions for your favorite projects

---

_Last updated: June 2026 | Total missions: 188 | Last audit: CNCF Landscape 2026_
