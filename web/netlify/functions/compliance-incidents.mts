/**
 * Netlify Function: Compliance Incidents
 *
 * Returns static demo incident data for the enterprise incident response dashboard
 * so production renders the same sample content as development without the Go backend.
 */
import { wrapIdentityDemoResponse } from "./_shared/identity-demo-request";

export default async (req: Request) => {
  return wrapIdentityDemoResponse(req, [
    { id: "INC-001", title: "Unauthorized container escape in prod-east-1", severity: "critical", status: "investigating", assignee: "alice@acme.com", created_at: "2026-01-15T09:30:00Z", updated_at: "2026-01-15T10:00:00Z", escalation_level: 2, cluster: "prod-east-1", playbook_id: "pb-container-escape" },
    { id: "INC-002", title: "Mass pod eviction in staging cluster", severity: "high", status: "mitigating", assignee: "bob@acme.com", created_at: "2026-01-15T08:30:00Z", updated_at: "2026-01-15T10:15:00Z", escalation_level: 1, cluster: "staging-1", playbook_id: "pb-pod-eviction" },
    { id: "INC-003", title: "Leaked service account token detected", severity: "critical", status: "open", assignee: "charlie@acme.com", created_at: "2026-01-15T10:00:00Z", updated_at: "2026-01-15T10:20:00Z", escalation_level: 3, cluster: "prod-west-2", playbook_id: null },
    { id: "INC-004", title: "TLS certificate expiry in 48h", severity: "medium", status: "investigating", assignee: "dana@acme.com", created_at: "2026-01-15T06:30:00Z", updated_at: "2026-01-15T09:30:00Z", escalation_level: 1, cluster: "prod-east-1", playbook_id: "pb-cert-renewal" },
    { id: "INC-005", title: "DNS resolution failures in dev cluster", severity: "low", status: "resolved", assignee: "eve@acme.com", created_at: "2026-01-14T10:30:00Z", updated_at: "2026-01-14T22:30:00Z", escalation_level: 0, cluster: "dev-1", playbook_id: null },
  ]);
};
