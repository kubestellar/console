/**
 * Netlify Function: Compliance ERM Risk Matrix Summary
 *
 * Returns static demo risk matrix summary data for the enterprise risk matrix dashboard
 * so production renders the same sample content as development without the Go backend.
 */
import { wrapIdentityDemoResponse } from "./_shared/identity-demo-request";

export default async (req: Request) => {
  return wrapIdentityDemoResponse(req, {
    total_risks: 18,
    critical: 2,
    high: 3,
    medium: 7,
    low: 6,
    trend_direction: "down",
    trend_percentage: 8,
    evaluated_at: "2026-01-15T10:30:00Z",
  });
};
