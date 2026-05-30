/**
 * Netlify Function: Identity Sessions Summary
 *
 * Returns demo session management summary for the enterprise Session dashboard.
 */
import { wrapIdentityDemoResponse } from "./_shared/identity-demo-request";

export default async (req: Request) => {
  return wrapIdentityDemoResponse(req, {
    active_sessions: 42,
    unique_users: 31,
    avg_duration_minutes: 47,
    sessions_terminated_24h: 15,
    policy_violations: 3,
    mfa_sessions_pct: 88,
    evaluated_at: new Date().toISOString(),
  });
};
