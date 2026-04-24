/**
 * Netlify Function: Identity Sessions Policies
 *
 * Returns demo session policy list for the enterprise Session dashboard.
 */
export default async () => {
  return new Response(
    JSON.stringify([
      { id: "pol-1", name: "Default Session Policy", description: "Standard session timeouts for all users", idle_timeout_minutes: 30, absolute_timeout_hours: 8, max_concurrent: 3, enforce_mfa: true, scope: "global" },
      { id: "pol-2", name: "Admin Session Policy", description: "Stricter timeouts for cluster administrators", idle_timeout_minutes: 15, absolute_timeout_hours: 4, max_concurrent: 1, enforce_mfa: true, scope: "admin" },
      { id: "pol-3", name: "Service Account Policy", description: "Long-lived sessions for automation and CI/CD", idle_timeout_minutes: 120, absolute_timeout_hours: 24, max_concurrent: 10, enforce_mfa: false, scope: "service-accounts" },
    ]),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
};
