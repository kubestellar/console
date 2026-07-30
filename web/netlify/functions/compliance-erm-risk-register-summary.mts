/**
 * Netlify Function: Compliance ERM Risk Register Summary
 *
 * Returns static demo risk register summary data for the enterprise risk register
 * dashboard so production renders the same sample content as development.
 */
import { wrapIdentityDemoResponse } from "./_shared/identity-demo-request";

export default async (req: Request) => {
  return wrapIdentityDemoResponse(req, {
    total_risks: 18,
    open_risks: 8,
    overdue_reviews: 2,
    avg_risk_score: 10.7,
    evaluated_at: "2026-01-15T10:30:00Z",
  });
};
