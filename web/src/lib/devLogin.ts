/**
 * #20823 — passwordless dev-login helpers for in-cluster installs without a
 * GitHub OAuth app. Kept in a separate module (not auth.tsx) so auth.tsx only
 * exports components/hooks and React Fast Refresh keeps working
 * (react-refresh/only-export-components).
 */

/** Options for login(). `preferDemo` skips the in-cluster dev-login redirect
 *  so the "Continue in Demo Mode" button always lands in demo mode (#20823). */
export interface LoginOptions {
  preferDemo?: boolean
}

/** Backend auth entry point. With no GitHub OAuth app configured the backend
 *  falls through to a passwordless dev-login that sets an HttpOnly JWT cookie
 *  and redirects back to /auth/callback. */
export const DEV_LOGIN_PATH = '/auth/github'

/** Named helper so tests can stub the navigation. */
export function redirectToDevLogin(): void {
  window.location.assign(DEV_LOGIN_PATH)
}
