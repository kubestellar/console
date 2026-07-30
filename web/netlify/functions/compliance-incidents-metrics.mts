/**
 * Netlify Function: Compliance Incident Metrics
 *
 * Returns static demo incident response metrics for the enterprise incident response
 * dashboard so production renders the same sample content as development without the Go backend.
 */
import { wrapIdentityDemoResponse } from "./_shared/identity-demo-request";

export default async (req: Request) => {
  return wrapIdentityDemoResponse(req, {
    total_incidents: 47,
    active_incidents: 4,
    resolved_last_30d: 18,
    mttr_hours: 4.2,
    mttr_trend: "improving",
    escalation_rate: 23,
    by_severity: { critical: 8, high: 14, medium: 17, low: 8 },
    by_status: { open: 2, investigating: 5, mitigating: 3, resolved: 18, closed: 19 },
  });
};
