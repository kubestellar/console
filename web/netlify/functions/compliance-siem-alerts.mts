/**
 * Netlify Function: Compliance SIEM Alerts
 *
 * Returns static demo SIEM alert data for the enterprise SIEM dashboard so
 * production renders the same sample content as development without the Go backend.
 */
import { wrapIdentityDemoResponse } from "./_shared/identity-demo-request";

export default async (req: Request) => {
  return wrapIdentityDemoResponse(req, [
    { id: "alrt-001", name: "Suspicious Process Execution", severity: "critical", status: "active", source: "falco", triggered_at: "2026-01-15T10:29:30Z", correlated_events: 5 },
    { id: "alrt-002", name: "Unauthorized API Access", severity: "high", status: "active", source: "kube-apiserver", triggered_at: "2026-01-15T10:28:30Z", correlated_events: 3 },
    { id: "alrt-003", name: "Network Policy Violation", severity: "high", status: "acknowledged", source: "calico", triggered_at: "2026-01-15T10:27:30Z", correlated_events: 8 },
    { id: "alrt-004", name: "Image Vulnerability Detected", severity: "medium", status: "active", source: "trivy", triggered_at: "2026-01-15T10:20:00Z", correlated_events: 2 },
    { id: "alrt-005", name: "Privilege Escalation Attempt", severity: "critical", status: "resolved", source: "falco", triggered_at: "2026-01-15T09:30:00Z", correlated_events: 12 },
    { id: "alrt-006", name: "OIDC Token Validation Failure", severity: "medium", status: "active", source: "kube-apiserver", triggered_at: "2026-01-15T08:30:00Z", correlated_events: 4 },
  ]);
};
