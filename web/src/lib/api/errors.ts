export class UnauthenticatedError extends Error {
  constructor() {
    super('No authentication token available')
    this.name = 'UnauthenticatedError'
  }
}

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

export class BackendUnavailableError extends Error {
  constructor() {
    super('Backend API is currently unavailable')
    this.name = 'BackendUnavailableError'
  }
}
