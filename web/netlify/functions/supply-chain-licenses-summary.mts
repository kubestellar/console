/**
 * Netlify Function: Supply Chain License Summary
 *
 * Returns static demo license summary data for the supply chain license dashboard so
 * production renders the same sample content as development without the Go backend.
 */
import { wrapIdentityDemoResponse } from "./_shared/identity-demo-request";

export default async (req: Request) => {
  return wrapIdentityDemoResponse(req, {
    total_packages: 3847,
    allowed_packages: 3814,
    warned_packages: 24,
    denied_packages: 9,
    unique_licenses: 47,
    workloads_scanned: 37,
    evaluated_at: "2026-01-15T10:30:00Z",
  });
};
