export const MAX_VIOLATION_ENTRIES = 10

export const TROUBLESHOOT_MISSIONS: Record<string, { title: string; description: string; prompt: string }> = {
  trivy: {
    title: 'Troubleshoot Trivy Operator',
    description: 'Trivy is installed but not producing vulnerability reports',
    prompt: `Trivy Operator is installed on my cluster but no VulnerabilityReports are being generated.

Please help me diagnose and fix the issue:
1. Check the trivy-operator pod status: kubectl get pods -n trivy-system -n trivy
2. Check operator logs for errors: kubectl logs -n trivy-system -l app.kubernetes.io/name=trivy-operator --tail=50
3. Check if any VulnerabilityReports exist: kubectl get vulnerabilityreports -A
4. Check if the operator's scan jobs are running or failing: kubectl get jobs -n trivy-system -n trivy
5. If pods are crashing, check resource limits and node capacity
6. If scans are stuck, try restarting the operator: kubectl rollout restart deployment -n trivy-system trivy-operator

Please diagnose step by step and fix any issues found.`,
  },
  kubescape: {
    title: 'Troubleshoot Kubescape Operator',
    description: 'Kubescape is installed but not producing scan results',
    prompt: `Kubescape Operator is installed on my cluster but no scan data is being generated (0 controls scanned).

Please help me diagnose and fix the issue:
1. Check all pods in the kubescape namespace: kubectl get pods -n kubescape
2. Look for crashing pods (especially kubevuln, operator, storage): kubectl get pods -n kubescape | grep -v Running
3. Check logs of failing pods: kubectl logs -n kubescape <pod-name> --tail=50
4. Verify the storage pod is running (required for scan data): kubectl get pods -n kubescape -l app=storage
5. Check if workloadconfigurationscans exist: kubectl get workloadconfigurationscans -A
6. If kubevuln or other pods are OOMKilled, increase resource limits
7. If storage pod is failing, check PVC status: kubectl get pvc -n kubescape
8. Try triggering a fresh scan: kubectl annotate ns default kubescape.io/scan=true --overwrite

Please diagnose step by step and fix any issues found.`,
  },
  kyverno: {
    title: 'Troubleshoot Kyverno',
    description: 'Kyverno is installed but no policies are configured',
    prompt: `Kyverno is installed on my cluster but no policies are configured or producing reports.

Please help me diagnose and fix the issue:
1. Check Kyverno pod status: kubectl get pods -n kyverno
2. Check for any existing policies: kubectl get clusterpolicies,policies -A
3. Check Kyverno controller logs: kubectl logs -n kyverno -l app.kubernetes.io/component=admission-controller --tail=50
4. If no policies exist, install a basic audit policy set:
   - disallow-privileged-containers (audit mode)
   - require-labels (audit mode)
   - restrict-image-registries (audit mode)
5. Check PolicyReports are being generated: kubectl get policyreports -A
6. If pods are crashing, check resource limits and webhook configuration

Please diagnose step by step and fix any issues found.`,
  },
}

export const COMPLIANCE_INSTALL_PROMPT = `I want to set up compliance monitoring on my Kubernetes clusters.

Please help me install one or both of these tools:

1. **Kubescape** — security posture scoring (CIS, NSA, MITRE frameworks)
   - Install via Helm: helm repo add kubescape https://kubescape.github.io/helm-charts && helm install kubescape kubescape/kubescape-operator -n kubescape --create-namespace

2. **Kyverno** — policy enforcement with compliance reports
   - Install via Helm: helm repo add kyverno https://kyverno.github.io/kyverno && helm install kyverno kyverno/kyverno -n kyverno --create-namespace

Please install at least one tool and verify it is producing scan results.`

export const FALCO_INSTALL_PROMPT =
  'Install Falco for runtime security monitoring on this cluster. ' +
  'Falco provides container runtime threat detection by watching kernel ' +
  'system calls and Kubernetes audit events. ' +
  'Use the official Helm chart: ' +
  '`helm repo add falcosecurity https://falcosecurity.github.io/charts && ' +
  'helm install falco falcosecurity/falco --namespace falco --create-namespace`. ' +
  'After installation, verify the Falco pods are running and producing events.'
