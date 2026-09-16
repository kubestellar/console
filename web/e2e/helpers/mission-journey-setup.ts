import { expect, Page, WebSocketRoute } from '@playwright/test'

/**
 * Mission Control JOURNEY Tests
 *
 * Journey-oriented lifecycle tests that validate complete mission state
 * transitions through the full pipeline: trigger → preflight → agent
 * connect → stream → complete/fail/cancel. Unlike the composition-focused
 * stress tests (mission-control-stress.spec.ts), these tests mock the
 * WebSocket agent connection and inject failures at each stage to verify
 * the state machine behaves correctly.
 *
 * Shared setup, mocks, and helpers for the mission-journey.*.spec.ts files
 * (split from the original monolithic mission-journey.spec.ts — see #23059).
 *
 * Covers all 8 flows from issue #8296:
 *   1. Happy path (full lifecycle)
 *   2. Runbook delay (async reliability)
 *   3. Runbook failure
 *   4. AI failure (agent error)
 *   5. API / route failure (HTTP 500/404)
 *   6. Cancellation mid-execution
 *   7. Duplicate trigger protection
 *   8. Refresh / recovery
 *
 * Run:
 *   npx playwright test e2e/mission-journey.*.spec.ts
 *
 * These are nightly/hourly tests, NOT PR CI gates.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Timeout for dialog/sidebar animations to settle */
export const UI_SETTLE_MS = 10_000

/** Timeout for the entire test (generous for nightly) */
export const TEST_TIMEOUT_MS = 120_000

/** WebSocket URL the frontend connects to */
export const WS_URL_PATTERN = /127\.0\.0\.1:8585/

/** localStorage key for mission state */
export const MISSIONS_STORAGE_KEY = 'kc_missions'

/** localStorage key for active mission */
export const ACTIVE_MISSION_KEY = 'kc_active_mission_id'

/** Minimum delay (ms) between WS stream chunks for realistic simulation */
export const STREAM_CHUNK_DELAY_MS = 50

/** Number of stream chunks in a typical AI response */
export const STREAM_CHUNK_COUNT = 5

/** Agent name used in mocks */
export const MOCK_AGENT_NAME = 'claude-agent'

/** Delay (ms) to simulate slow runbook responses */
export const SLOW_RUNBOOK_DELAY_MS = 3000

/** Max number of rapid clicks for duplicate-trigger test */
export const RAPID_CLICK_COUNT = 5

// ---------------------------------------------------------------------------
// Named wait durations (#9079)
//
// These replace the arbitrary `waitForTimeout(...)` literals that previously
// appeared throughout this file. Each constant expresses WHY we wait — tests
// that actually care about a DOM transition should prefer `expect(...).toBe
// Visible()` / `expect.poll(...)` instead of a fixed sleep. These constants
// exist so the remaining (genuinely time-based) waits are self-documenting
// and tunable from a single location.
// ---------------------------------------------------------------------------

/** Brief pause for a sidebar/dialog animation to settle. */
export const UI_ANIMATION_SETTLE_MS = 500
/** Short pause for the app to persist local state (localStorage write). */
export const PERSIST_SETTLE_MS = 800
/** Short wait for an event to have a chance to fire (1s = debounce + tick). */
export const EVENT_SETTLE_MS = 1_000
/** A generous animation settle + render window. */
export const RENDER_SETTLE_MS = 1_500
/** Time to wait for a mission to appear / a WS message to round-trip. */
export const MISSION_ROUNDTRIP_MS = 2_000
/** Time for the journey streaming chunks to finish arriving. */
export const STREAM_SETTLE_MS = 3_000
/** Long wait for end-to-end mission lifecycle (trigger → complete). */
export const LIFECYCLE_SETTLE_MS = 5_000
/** Extra padding on top of a slow-runbook delay before expectations. */
export const SLOW_RUNBOOK_PADDING_MS = 2_000
/** Upper bound wait for the longest flow (recovery / reload). */
export const RECOVERY_SETTLE_MS = 8_000

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

export const MOCK_USER = {
  id: '1',
  github_id: '99999',
  github_login: 'journey-tester',
  email: 'journey@test.dev',
  onboarded: true,
  role: 'admin',
}

export const MOCK_AGENTS_LIST = {
  agents: [
    {
      name: MOCK_AGENT_NAME,
      displayName: 'Claude Agent',
      description: 'AI agent for mission execution',
      available: true,
      capabilities: 3,
    },
  ],
  defaultAgent: MOCK_AGENT_NAME,
  selected: MOCK_AGENT_NAME,
}

export const MOCK_CLUSTERS = {
  clusters: [
    { name: 'prod-us-east', context: 'prod-us-east', healthy: true, nodeCount: 10, podCount: 200, provider: 'eks', reachable: true },
    { name: 'staging', context: 'staging', healthy: true, nodeCount: 3, podCount: 40, provider: 'kind', reachable: true },
  ],
}

// ---------------------------------------------------------------------------
// WebSocket message builders
// ---------------------------------------------------------------------------

export interface WSMessage {
  id: string
  type: string
  payload?: unknown
}

export function buildAgentsList(): string {
  return JSON.stringify({
    id: `msg-${Date.now()}`,
    type: 'agents_list',
    payload: MOCK_AGENTS_LIST,
  })
}

export function buildStreamChunk(sessionId: string, content: string, done = false): string {
  return JSON.stringify({
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type: 'stream',
    payload: {
      content,
      sessionId,
      done,
      model: 'claude-3.5-sonnet',
      usage: done ? { inputTokens: 500, outputTokens: 200 } : undefined,
    },
  })
}

export function buildResult(sessionId: string, content: string): string {
  return JSON.stringify({
    id: `msg-${Date.now()}`,
    type: 'result',
    payload: {
      content,
      sessionId,
      done: true,
      model: 'claude-3.5-sonnet',
      usage: { inputTokens: 500, outputTokens: 200 },
    },
  })
}

export function buildError(sessionId: string, errorMessage: string): string {
  return JSON.stringify({
    id: `msg-${Date.now()}`,
    type: 'error',
    payload: {
      content: errorMessage,
      sessionId,
      error: errorMessage,
    },
  })
}

export function buildProgress(sessionId: string, step: string, percent: number): string {
  return JSON.stringify({
    id: `msg-${Date.now()}`,
    type: 'progress',
    payload: {
      content: step,
      sessionId,
      progress: percent,
    },
  })
}

export function buildCancelAck(sessionId: string): string {
  return JSON.stringify({
    id: `msg-${Date.now()}`,
    type: 'cancel_confirmed',
    payload: { sessionId, content: 'Mission cancelled.' },
  })
}

// ---------------------------------------------------------------------------
// Helpers: HTTP route mocking
// ---------------------------------------------------------------------------

export async function setupHTTPMocks(page: Page, overrides?: {
  healthStatus?: number
  meStatus?: number
  missionsBrowseStatus?: number
  missionsBrowseDelay?: number
  mcpOpsDelay?: number
  mcpOpsStatus?: number
}) {
  const opts = overrides || {}

  await page.route('**/api/me', route =>
    route.fulfill({
      status: opts.meStatus ?? 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_USER),
    })
  )

  for (const pattern of ['**/api/health', '**/health']) {
    await page.route(pattern, route =>
      route.fulfill({
        status: opts.healthStatus ?? 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ok', oauth_configured: false, in_cluster: false, install_method: 'dev' }),
      })
    )
  }

  await page.route('**/api/mcp/clusters', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_CLUSTERS),
    })
  )

  await page.route('**/api/mcp/ops/call', async route => {
    if (opts.mcpOpsDelay) {
      await new Promise(r => setTimeout(r, opts.mcpOpsDelay))
    }
    route.fulfill({
      status: opts.mcpOpsStatus ?? 200,
      contentType: 'application/json',
      body: JSON.stringify({ result: { pods: [], events: [], nodes: [] }, isError: false }),
    })
  })

  await page.route('**/api/mcp/**', route => {
    const url = route.request().url()
    if (url.includes('/clusters') || url.includes('/ops/call')) return route.fallback()
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"issues":[],"events":[],"nodes":[],"pods":[]}' })
  })

  await page.route('**/api/github/token/status', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"hasToken":true,"source":"env"}' })
  )

  await page.route('**/api/agent/**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":"ok"}' })
  )

  await page.route('**/api/missions/**', async route => {
    if (opts.missionsBrowseStatus && opts.missionsBrowseStatus !== 200) {
      return route.fulfill({ status: opts.missionsBrowseStatus, contentType: 'application/json', body: '{"error":"not found"}' })
    }
    if (opts.missionsBrowseDelay) {
      await new Promise(r => setTimeout(r, opts.missionsBrowseDelay))
    }
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"items":[]}' })
  })

  await page.route('**/api/gadget/**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"result":{"traces":[]},"isError":false}' })
  )

  // Catch-all for remaining API routes
  await page.route('**/api/**', route => {
    const url = route.request().url()
    if (url.includes('/api/me') || url.includes('/api/mcp') || url.includes('/api/health') ||
        url.includes('/api/github') || url.includes('/api/agent') || url.includes('/api/missions') ||
        url.includes('/api/gadget')) {
      return route.fallback()
    }
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })

  // Mock the local kc-agent HTTP endpoint. The cluster cache probes
  // http://127.0.0.1:8585/clusters before falling back to demo data.
  // Without this mock, the probe hangs in CI (#11179).
  await page.route('http://127.0.0.1:8585/**', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Service unavailable (test mock)' }),
    })
  )
}

// ---------------------------------------------------------------------------
// Helpers: Authentication + navigation
// ---------------------------------------------------------------------------

export async function seedAuth(page: Page) {
  await page.evaluate(() => {
    localStorage.setItem('token', 'demo-token')
    localStorage.setItem('kc-demo-mode', 'true')
    localStorage.setItem('kc_onboarded', 'true')
    localStorage.setItem('kc_tour_completed', 'true')
    localStorage.setItem('kc-agent-setup-dismissed', 'true')
    localStorage.setItem('kc_user_cache', JSON.stringify({
      id: 'demo-user', github_id: '99999', github_login: 'journey-tester',
      email: 'journey@test.dev', role: 'admin', onboarded: true,
    }))
  })
}

export async function navigateToDashboard(page: Page) {
  await page.goto('/login')
  await page.waitForLoadState('domcontentloaded')
  await seedAuth(page)
  await page.goto('/')
  await page.waitForLoadState('networkidle', { timeout: UI_SETTLE_MS })
  await expect(page.locator('body')).not.toBeEmpty({ timeout: UI_SETTLE_MS })

  // If stuck on login, retry auth
  const MAX_AUTH_RETRIES = 3
  for (let i = 0; i < MAX_AUTH_RETRIES; i++) {
    const onLogin = await page.getByText('Continue with GitHub').isVisible({ timeout: 2000 }).catch((error) => { console.error('Promise error:', error); return false })
    if (!onLogin) break
    await seedAuth(page)
    await page.goto('/')
    await page.waitForLoadState('networkidle', { timeout: UI_SETTLE_MS })
  }
}

// ---------------------------------------------------------------------------
// Helpers: Mission sidebar interaction
// ---------------------------------------------------------------------------

export async function openMissionSidebar(page: Page) {
  const clicked = await page.evaluate(() => {
    // Prefer the dedicated sidebar toggle button
    const toggle = document.querySelector('[data-testid="mission-sidebar-toggle"]') as HTMLElement
      || document.querySelector('[data-tour="ai-missions-toggle"]') as HTMLElement
    if (toggle) { toggle.click(); return true }
    // Fallback: any button with "Mission" in its title
    const btn = document.querySelector('button[title*="Mission"]') as HTMLElement
    if (btn) { btn.click(); return true }
    // Fallback: any button with "Mission" in its text
    const buttons = Array.from(document.querySelectorAll('button'))
    const mcBtn = buttons.find(b => b.textContent?.includes('Mission'))
    if (mcBtn) { (mcBtn as HTMLElement).click(); return true }
    return false
  })
  if (!clicked) {
    const btn = page.locator('[data-testid="mission-sidebar-toggle"]')
      .or(page.locator('button', { hasText: /Mission/i }))
      .first()
    await expect(btn).toBeVisible({ timeout: 5000 })
    await btn.click({ force: true })
  }
  const sidebar = page.locator('[data-testid="mission-sidebar"], [class*="mission-sidebar"]').first()
  await sidebar.waitFor({ state: 'visible', timeout: UI_ANIMATION_SETTLE_MS }).catch((error) => { console.error('Promise catch:', error) })
  await expect(page.getByTestId('mission-chat-composer')).toBeVisible({ timeout: UI_SETTLE_MS })
}

export function getMissionComposerInput(page: Page) {
  return page.getByTestId('mission-chat-composer').locator('input[type="text"]').first()
}

export function getMissionTerminateButton(page: Page) {
  return page.locator([
    '[data-testid="terminate-session-btn"]',
    'button[title*="Terminate"]',
    'button[title*="Cancel"]',
    'button[aria-label*="Terminate"]',
    'button[aria-label*="Cancel"]',
  ].join(', ')).first()
}

export async function getMissionStatus(page: Page, missionId?: string): Promise<string | null> {
  return page.evaluate(({ id, key }) => {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    try {
      const missions = JSON.parse(raw)
      if (!Array.isArray(missions)) return null
      const mission = id ? missions.find((m: { id: string }) => m.id === id) : missions[0]
      return mission?.status || null
    } catch (error) { console.error('Error:', error); return null; }
  }, { id: missionId || null, key: MISSIONS_STORAGE_KEY })
}

export async function getMissionCount(page: Page): Promise<number> {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key)
    if (!raw) return 0
    try {
      const missions = JSON.parse(raw)
      return Array.isArray(missions) ? missions.length : 0
    } catch (error) { console.error('Error:', error); return 0; }
  }, MISSIONS_STORAGE_KEY)
}

export async function getActiveMissions(page: Page): Promise<Array<{ id: string; status: string; title: string }>> {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    try {
      const missions = JSON.parse(raw)
      if (!Array.isArray(missions)) return []
      return missions
        .filter((m: { status: string }) => !['completed', 'failed', 'cancelled', 'saved'].includes(m.status))
        .map((m: { id: string; status: string; title: string }) => ({ id: m.id, status: m.status, title: m.title }))
    } catch (error) { console.error('Error:', error); return []; }
  }, MISSIONS_STORAGE_KEY)
}

// ---------------------------------------------------------------------------
// Helpers: WebSocket simulation
// ---------------------------------------------------------------------------

/**
 * Simulate a complete happy-path AI response over WebSocket.
 * Sends agents_list → stream chunks → result.
 */
export async function simulateHappyResponse(ws: WebSocketRoute, sessionId: string) {
  ws.send(buildAgentsList())
  await delay(STREAM_CHUNK_DELAY_MS)

  const chunks = [
    'Analyzing the cluster state...',
    'Running kubectl get pods -n production...',
    'Found 3 pods in CrashLoopBackOff.',
    'Applying fix: increasing memory limit to 1Gi...',
    'Verifying fix applied successfully.',
  ]
  for (const chunk of chunks) {
    ws.send(buildStreamChunk(sessionId, chunk))
    await delay(STREAM_CHUNK_DELAY_MS)
  }

  ws.send(buildStreamChunk(sessionId, '', true))
  await delay(STREAM_CHUNK_DELAY_MS)
  ws.send(buildResult(sessionId, 'Mission completed successfully. Fixed 3 pods by increasing memory limits.'))
}

/**
 * Simulate a delayed response (runbook takes extra time).
 */
export async function simulateDelayedResponse(ws: WebSocketRoute, sessionId: string, delayMs: number) {
  ws.send(buildAgentsList())
  await delay(STREAM_CHUNK_DELAY_MS)

  ws.send(buildProgress(sessionId, 'Running runbook: gathering evidence...', 10))
  await delay(delayMs)

  ws.send(buildProgress(sessionId, 'Evidence collected. Starting analysis...', 50))
  await delay(STREAM_CHUNK_DELAY_MS)

  ws.send(buildStreamChunk(sessionId, 'Analysis complete after extended evidence gathering.'))
  await delay(STREAM_CHUNK_DELAY_MS)
  ws.send(buildStreamChunk(sessionId, '', true))
  ws.send(buildResult(sessionId, 'Delayed mission completed. Runbook evidence took extra time but succeeded.'))
}

/**
 * Simulate a runbook failure (error mid-execution).
 */
export async function simulateRunbookFailure(ws: WebSocketRoute, sessionId: string) {
  ws.send(buildAgentsList())
  await delay(STREAM_CHUNK_DELAY_MS)

  ws.send(buildProgress(sessionId, 'Running runbook: checking pods...', 10))
  await delay(STREAM_CHUNK_DELAY_MS)

  ws.send(buildStreamChunk(sessionId, 'Error: runbook step failed — kubectl returned exit code 1'))
  await delay(STREAM_CHUNK_DELAY_MS)

  ws.send(buildError(sessionId, 'Runbook execution failed: kubectl get pods returned non-zero exit code. RBAC permission denied for namespace "production".'))
}

/**
 * Simulate an AI/agent error (backend processing fails).
 */
export async function simulateAgentError(ws: WebSocketRoute, sessionId: string) {
  ws.send(buildAgentsList())
  await delay(STREAM_CHUNK_DELAY_MS)

  ws.send(buildStreamChunk(sessionId, 'Starting analysis...'))
  await delay(STREAM_CHUNK_DELAY_MS)

  ws.send(buildError(sessionId, 'Agent encountered an internal error: context window exceeded. Please retry with a shorter prompt.'))
}

export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

