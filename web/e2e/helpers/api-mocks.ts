import { type Page, type Route } from '@playwright/test'

/**
 * E2E Strict API Mocking Helper
 *
 * Replaces catch-all `page.route('/api/**')` patterns with explicit endpoint
 * handlers that:
 *   1. Track which endpoints were called
 *   2. Log unexpected/unmocked API calls instead of silently returning {}
 *   3. Provide properly-shaped response data for known endpoints
 *   4. Fail tests when unexpected endpoints are hit (optional)
 *
 * See Issue #11225 — broad catch-all mocks prevent detection of real backend
 * issues like missing endpoints, broken routes, or malformed responses.
 *
 * Usage:
 *   const apiTracker = await strictApiMocking(page, { failOnUnmocked: false })
 *   // ... run test ...
 *   expect(apiTracker.called('/api/me')).toBe(true)
 *   expect(apiTracker.unmockedCalls).toHaveLength(0)
 */

// ---------------------------------------------------------------------------
// Response shape factories — properly typed data for common endpoints
// ---------------------------------------------------------------------------

export const API_RESPONSES = {
  /** /api/me — authenticated user */
  me: () => ({
    id: '1',
    github_id: '99999',
    github_login: 'demo-user',
    email: 'demo@kubestellar.io',
    onboarded: true,
    role: 'admin',
  }),

  /** /health — backend health check */
  health: () => ({
    status: 'ok',
    version: 'dev',
    oauth_configured: false,
    in_cluster: false,
    no_local_agent: true,
    install_method: 'dev',
  }),

  /** /api/active-users — presence tracking */
  activeUsers: () => ({
    activeUsers: 1,
    totalConnections: 1,
  }),

  /** /api/dashboards — dashboard list */
  dashboards: () => [],

  /** /api/cards — card list */
  cards: () => [],

  /** /api/settings — user settings */
  settings: () => ({}),

  /** /api/mcp/** — MCP/agent endpoints return empty arrays for clusters/issues/events */
  mcp: () => ({
    clusters: [],
    issues: [],
    events: [],
    nodes: [],
    pods: [],
    deployments: [],
    services: [],
    namespaces: [],
  }),

  /** kc-agent HTTP endpoint — 503 to trigger demo fallback */
  kcAgentHttp: () => ({
    status: 503,
    body: { error: 'Service unavailable (test mock)' },
  }),

  /** /api/missions/browse — mission catalog */
  missionsBrowse: () => [],

  /** /api/missions/scores — mission leaderboard */
  missionsScores: () => ({
    topScores: [],
    userScore: null,
  }),

  /** /api/rewards/github — GitHub contributor rewards */
  rewardsGithub: () => ({
    topContributors: [],
    recentActivity: [],
  }),

  /** /api/youtube/playlist — YouTube feed */
  youtubePlaylist: () => ({
    items: [],
  }),

  /** /api/medium/blog — Medium blog posts */
  mediumBlog: () => ({
    items: [],
  }),

  /** /api/issue-stats — GitHub issue statistics */
  issueStats: () => ({
    open: 0,
    closed: 0,
    totalComments: 0,
  }),

  /** /api/github-pipelines — CI/CD pipeline status */
  githubPipelines: () => ({
    workflows: [],
  }),
} as const

// ---------------------------------------------------------------------------
// API call tracker — records which endpoints were hit during the test
// ---------------------------------------------------------------------------

export interface ApiCallTracker {
  /** All API calls made during the test (successful mocks + unmocked) */
  allCalls: string[]
  /** API calls that had no explicit mock handler */
  unmockedCalls: string[]
  /** Check if a specific endpoint was called */
  called: (endpoint: string) => boolean
  /** Get call count for an endpoint */
  callCount: (endpoint: string) => number
}

function createApiCallTracker(): ApiCallTracker {
  const allCalls: string[] = []
  const unmockedCalls: string[] = []

  return {
    allCalls,
    unmockedCalls,
    called: (endpoint: string) => allCalls.some(call => call.includes(endpoint)),
    callCount: (endpoint: string) => allCalls.filter(call => call.includes(endpoint)).length,
  }
}

// ---------------------------------------------------------------------------
// Strict API mocking — explicit handlers with unmocked call tracking
// ---------------------------------------------------------------------------

export interface StrictApiMockingOptions {
  /**
   * If true, unmocked API calls will cause route.abort() (test will see
   * failed fetch). If false (default), unmocked calls are logged but still
   * return 200 with {} so existing tests don't break immediately.
   */
  failOnUnmocked?: boolean

  /**
   * If true, console.error will be called for unmocked endpoints so they
   * appear in test output. Default: true.
   */
  logUnmocked?: boolean

  /**
   * Additional explicit route handlers to register. Called AFTER the
   * built-in handlers, so they can override defaults if needed.
   */
  customHandlers?: Array<{
    pattern: string | RegExp
    handler: (route: Route) => Promise<void>
  }>
}

/**
 * Set up strict API mocking with explicit handlers for known endpoints.
 * Replaces catch-all page.route('/api/**') patterns.
 *
 * Returns an ApiCallTracker for asserting on which endpoints were called.
 */
export async function strictApiMocking(
  page: Page,
  options: StrictApiMockingOptions = {}
): Promise<ApiCallTracker> {
  const {
    failOnUnmocked = false,
    logUnmocked = true,
    customHandlers = [],
  } = options

  const tracker = createApiCallTracker()

  // Helper: standard JSON response
  const jsonResponse = (data: unknown, status = 200) => ({
    status,
    contentType: 'application/json',
    body: JSON.stringify(data),
  })

  // ---------------------------------------------------------------------------
  // Explicit endpoint handlers (highest priority — registered last)
  // ---------------------------------------------------------------------------

  // /api/me
  await page.route('**/api/me', async (route) => {
    tracker.allCalls.push(route.request().url())
    await route.fulfill(jsonResponse(API_RESPONSES.me()))
  })

  // /health (root-level only, not /api/health)
  await page.route('**/health', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname !== '/health') {
      return route.fallback()
    }
    tracker.allCalls.push(route.request().url())
    await route.fulfill(jsonResponse(API_RESPONSES.health()))
  })

  // /api/active-users
  await page.route('**/api/active-users*', async (route) => {
    tracker.allCalls.push(route.request().url())
    await route.fulfill(jsonResponse(API_RESPONSES.activeUsers()))
  })

  // /api/dashboards
  await page.route('**/api/dashboards*', async (route) => {
    tracker.allCalls.push(route.request().url())
    await route.fulfill(jsonResponse(API_RESPONSES.dashboards()))
  })

  // /api/cards
  await page.route('**/api/cards*', async (route) => {
    tracker.allCalls.push(route.request().url())
    await route.fulfill(jsonResponse(API_RESPONSES.cards()))
  })

  // /api/settings
  await page.route('**/api/settings*', async (route) => {
    tracker.allCalls.push(route.request().url())
    await route.fulfill(jsonResponse(API_RESPONSES.settings()))
  })

  // /api/mcp/**
  await page.route('**/api/mcp/**', async (route) => {
    tracker.allCalls.push(route.request().url())
    await route.fulfill(jsonResponse(API_RESPONSES.mcp()))
  })

  // /api/missions/browse
  await page.route('**/api/missions/browse*', async (route) => {
    tracker.allCalls.push(route.request().url())
    await route.fulfill(jsonResponse(API_RESPONSES.missionsBrowse()))
  })

  // /api/missions/scores
  await page.route('**/api/missions/scores*', async (route) => {
    tracker.allCalls.push(route.request().url())
    await route.fulfill(jsonResponse(API_RESPONSES.missionsScores()))
  })

  // /api/rewards/github
  await page.route('**/api/rewards/github*', async (route) => {
    tracker.allCalls.push(route.request().url())
    await route.fulfill(jsonResponse(API_RESPONSES.rewardsGithub()))
  })

  // /api/youtube/playlist
  await page.route('**/api/youtube/playlist*', async (route) => {
    tracker.allCalls.push(route.request().url())
    await route.fulfill(jsonResponse(API_RESPONSES.youtubePlaylist()))
  })

  // /api/medium/blog
  await page.route('**/api/medium/blog*', async (route) => {
    tracker.allCalls.push(route.request().url())
    await route.fulfill(jsonResponse(API_RESPONSES.mediumBlog()))
  })

  // /api/issue-stats
  await page.route('**/api/issue-stats*', async (route) => {
    tracker.allCalls.push(route.request().url())
    await route.fulfill(jsonResponse(API_RESPONSES.issueStats()))
  })

  // /api/github-pipelines
  await page.route('**/api/github-pipelines*', async (route) => {
    tracker.allCalls.push(route.request().url())
    await route.fulfill(jsonResponse(API_RESPONSES.githubPipelines()))
  })

  // kc-agent HTTP endpoint (http://127.0.0.1:8585/**)
  await page.route('http://127.0.0.1:8585/**', async (route) => {
    tracker.allCalls.push(route.request().url())
    const { status, body } = API_RESPONSES.kcAgentHttp()
    await route.fulfill(jsonResponse(body, status))
  })

  // ---------------------------------------------------------------------------
  // Custom handlers (if provided)
  // ---------------------------------------------------------------------------

  for (const { pattern, handler } of customHandlers) {
    await page.route(pattern, handler)
  }

  // ---------------------------------------------------------------------------
  // Catch-all for unmocked /api/** — logs/fails instead of silent {}
  // ---------------------------------------------------------------------------

  await page.route('**/api/**', async (route) => {
    const url = route.request().url()
    tracker.allCalls.push(url)
    tracker.unmockedCalls.push(url)

    if (logUnmocked) {
      // eslint-disable-next-line no-console
      console.error(`[strict-api-mocking] Unmocked API call: ${url}`)
    }

    if (failOnUnmocked) {
      // Abort the request — test will see a network error
      await route.abort('failed')
    } else {
      // Return empty object but log the issue
      await route.fulfill(jsonResponse({}))
    }
  })

  return tracker
}

// ---------------------------------------------------------------------------
// Helper: setup strict mocking + demo mode localStorage
// ---------------------------------------------------------------------------

/**
 * Combined setup: strict API mocking + demo mode localStorage.
 * Replacement for setupDemoMode() that uses strict mocking.
 */
export async function setupStrictDemoMode(
  page: Page,
  options: StrictApiMockingOptions = {}
): Promise<ApiCallTracker> {
  // Set localStorage before page loads
  await page.addInitScript(() => {
    localStorage.setItem('token', 'demo-token')
    localStorage.setItem('kc-demo-mode', 'true')
    localStorage.setItem('kc-has-session', 'true')
    localStorage.setItem('demo-user-onboarded', 'true')
    localStorage.setItem('kc-backend-status', JSON.stringify({
      available: true,
      timestamp: Date.now(),
    }))
    localStorage.setItem('kc-agent-setup-dismissed', 'true')
  })

  // Set up strict API mocking
  return strictApiMocking(page, options)
}
