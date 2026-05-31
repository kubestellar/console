/**
 * Netlify Function: Supply Chain SBOM Summary
 *
 * Returns static demo SBOM summary data for the supply chain SBOM dashboard so
 * production renders the same sample content as development without the Go backend.
 */
import { wrapIdentityDemoResponse } from "./_shared/identity-demo-request";

export default async (req: Request) => {
  return wrapIdentityDemoResponse(req, {
    total_workloads: 42,
    sbom_coverage: 88,
    total_components: 3847,
    vulnerable_components: 12,
    critical_count: 2,
    high_count: 5,
    generated_at: "2026-01-15T10:30:00Z",
  });
};
