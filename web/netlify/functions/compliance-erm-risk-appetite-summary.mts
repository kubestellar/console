/**
 * Netlify Function: Compliance ERM Risk Appetite Summary
 *
 * Returns static demo risk appetite summary data for the enterprise risk appetite
 * dashboard so production renders the same sample content as development.
 */
import { wrapIdentityDemoResponse } from "./_shared/identity-demo-request";

export default async (req: Request) => {
  return wrapIdentityDemoResponse(req, {
    total_categories: 6,
    breaches: 1,
    amber_warnings: 2,
    within_appetite: 3,
    total_kris: 12,
    kri_breaches: 2,
    evaluated_at: "2026-01-15T10:30:00Z",
  });
};
