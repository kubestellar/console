/** Error class for unauthenticated requests (no token present). */
export class UnauthenticatedError extends Error {
  constructor() {
    super('No authentication token available')
    this.name = 'UnauthenticatedError'
  }
}

/** Error class for 401 unauthorized responses (invalid/expired token). */
export class UnauthorizedError extends Error {
  constructor() {
    super('Token is invalid or expired')
    this.name = 'UnauthorizedError'
  }
}

export class RateLimitError extends Error {
  retryAfter: number
  constructor(retryAfter: number) {
    super(`Rate limited. Try again in ${retryAfter} seconds.`)
    this.name = 'RateLimitError'
    this.retryAfter = retryAfter
  }
}

/** Error class for backend unavailable. */
export class BackendUnavailableError extends Error {
  constructor() {
    super('Backend API is currently unavailable')
    this.name = 'BackendUnavailableError'
  }
}

/** Result of probing the backend /health endpoint for auth configuration. */
export interface OAuthProbeResult {
  backendUp: boolean
  oauthConfigured: boolean
  /** True when the backend reports it is running inside a Kubernetes cluster
   *  (`in_cluster` in /health). Defaults to false when absent (e.g. Netlify
   *  functions or older backends) so hosted-site behavior is unchanged. */
  inCluster: boolean
}
