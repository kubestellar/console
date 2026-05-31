/**
 * Netlify Function: Compliance SIEM Events
 *
 * Returns static demo SIEM event data for the enterprise SIEM dashboard so
 * production renders the same sample content as development without the Go backend.
 */
import { wrapIdentityDemoResponse } from "./_shared/identity-demo-request";

export default async (req: Request) => {
  return wrapIdentityDemoResponse(req, [
    { id: "evt-001", timestamp: "2026-01-15T10:29:00Z", source: "falco", severity: "critical", category: "runtime", message: "Unexpected process spawned in container nginx-proxy", cluster: "prod-east-1" },
    { id: "evt-002", timestamp: "2026-01-15T10:28:00Z", source: "auditd", severity: "high", category: "access", message: "Unauthorized kubectl exec attempt on kube-system namespace", cluster: "prod-east-1" },
    { id: "evt-003", timestamp: "2026-01-15T10:27:00Z", source: "kube-apiserver", severity: "medium", category: "auth", message: "ServiceAccount token used from unexpected IP range", cluster: "prod-west-2" },
    { id: "evt-004", timestamp: "2026-01-15T10:26:00Z", source: "calico", severity: "high", category: "network", message: "Network policy violation: egress to blocked CIDR detected", cluster: "staging-1" },
    { id: "evt-005", timestamp: "2026-01-15T10:25:00Z", source: "trivy", severity: "medium", category: "vulnerability", message: "Critical CVE detected in running container image", cluster: "prod-east-1" },
    { id: "evt-006", timestamp: "2026-01-15T10:24:00Z", source: "falco", severity: "low", category: "runtime", message: "Read of sensitive file /etc/shadow in container", cluster: "dev-1" },
    { id: "evt-007", timestamp: "2026-01-15T10:23:00Z", source: "opa", severity: "info", category: "policy", message: "Pod admission policy evaluated: 3 constraints checked", cluster: "prod-west-2" },
    { id: "evt-008", timestamp: "2026-01-15T10:22:00Z", source: "kube-apiserver", severity: "high", category: "auth", message: "Failed OIDC token validation from external identity provider", cluster: "prod-east-1" },
  ]);
};
