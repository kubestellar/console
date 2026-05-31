/**
 * Netlify Function: Compliance ERM Risk Register Categories
 *
 * Returns static demo risk register category aggregates for the enterprise risk
 * register dashboard so production renders the same sample content as development.
 */
import { wrapIdentityDemoResponse } from "./_shared/identity-demo-request";

export default async (req: Request) => {
  return wrapIdentityDemoResponse(req, [
    { category: "Operational", count: 4, avg_score: 8.8, open: 1 },
    { category: "Strategic", count: 3, avg_score: 8.7, open: 2 },
    { category: "Financial", count: 2, avg_score: 10.0, open: 0 },
    { category: "Compliance", count: 2, avg_score: 10.0, open: 1 },
    { category: "Technology", count: 6, avg_score: 14.3, open: 2 },
    { category: "Reputational", count: 2, avg_score: 6.5, open: 1 },
  ]);
};
