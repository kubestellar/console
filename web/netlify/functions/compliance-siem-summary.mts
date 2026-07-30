/**
 * Netlify Function: Compliance SIEM Summary
 *
 * Returns static demo SIEM summary data for the enterprise SIEM dashboard so
 * production renders the same sample content as development without the Go backend.
 */
import { wrapIdentityDemoResponse } from "./_shared/identity-demo-request";

export default async (req: Request) => {
  return wrapIdentityDemoResponse(req, {
    total_events: 14832,
    events_last_24h: 2847,
    total_alerts: 23,
    active_alerts: 8,
    critical_alerts: 3,
    high_alerts: 7,
    medium_alerts: 9,
    low_alerts: 4,
    top_sources: [
      { source: "falco", count: 1243 },
      { source: "kube-apiserver", count: 876 },
      { source: "calico", count: 412 },
      { source: "trivy", count: 198 },
      { source: "opa", count: 118 },
    ],
    ingestion_rate: 42,
  });
};
