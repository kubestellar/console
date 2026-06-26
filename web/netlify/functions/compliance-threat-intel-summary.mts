/**
 * Netlify Function: Compliance Threat Intel Summary
 *
 * Returns static demo threat intelligence summary data for the enterprise threat intel
 * dashboard so production renders the same sample content as development without the Go backend.
 */
import { wrapIdentityDemoResponse } from "./_shared/identity-demo-request";

export default async (req: Request) => {
  return wrapIdentityDemoResponse(req, {
    total_feeds: 6,
    active_feeds: 5,
    total_indicators: 175960,
    total_matches: 23,
    active_matches: 8,
    risk_score: 42,
    critical_matches: 3,
    high_matches: 7,
    medium_matches: 9,
    low_matches: 4,
    top_ioc_types: [
      { type: "ip", count: 9 },
      { type: "domain", count: 6 },
      { type: "hash", count: 4 },
      { type: "url", count: 3 },
      { type: "email", count: 1 },
    ],
    vulnerability_correlation: 73,
  });
};
