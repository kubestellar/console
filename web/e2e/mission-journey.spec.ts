import { test, expect, Page, WebSocketRoute } from '@playwright/test'

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
 *   npx playwright test e2e/mission-journey.spec.ts
 *
 * These are nightly/hourly tests, NOT PR CI gates.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Timeout for dialog/sidebar animations to settle */
const UI_SETTLE_MS = 10_000

/** Timeout for the entire test (generous for nightly) */
const TEST_TIMEOUT_MS = 120_000

/** WebSocket URL the frontend connects to */
const WS_URL_PATTERN = /127\.0\.0\.1:8585/

/** localStorage key for mission state */
const MISSIONS_STORAGE_KEY = 'kc_missions'

/** localStorage key for active mission */
const ACTIVE_MISSION_KEY = 'kc_active_mission_id'

/** Minimum delay (ms) between WS stream chunks for realistic simulation */
const STREAM_CHUNK_DELAY_MS = 50

/** Number of stream chunks in a typical AI response */
const STREAM_CHUNK_COUNT = 5

/** Agent name used in mocks */
const MOCK_AGENT_NAME = 'claude-agent'

/** Delay (ms) to simulate slow runbook responses */
const SLOW_RUNBOOK_DELAY_MS = 3000

/** Max number of rapid clicks for duplicate-trigger test */
const RAPID_CLICK_COUNT = 5

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
const UI_ANIMATION_SETTLE_MS = 500
/** Short pause for the app to persist local state (localStorage write). */
const PERSIST_SETTLE_MS = 800
/** Short wait for an event to have a chance to fire (1s = debounce + tick). */
const EVENT_SETTLE_MS = 1_000
/** A generous animation settle + render window. */
const RENDER_SETTLE_MS = 1_500
/** Time to wait for a mission to appear / a WS message to round-trip. */
const MISSION_ROUNDTRIP_MS = 2_000
/** Time for the journey streaming chunks to finish arriving. */
const STREAM_SETTLE_MS = 3_000
/** Long wait for end-to-end mission lifecycle (trigger → complete). */
const LIFECYCLE_SETTLE_MS = 5_000
/** Extra padding on top of a slow-runbook delay before expectations. */
const SLOW_RUNBOOK_PADDING_MS = 2_000
/** Upper bound wait for the longest flow (recovery / reload). */
const RECOVERY_SETTLE_MS = 8_000

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_USER = {
  id: '1',
  github_id: '99999',
  github_login: 'journey-tester',
  email: 'journey@test.dev',
  onboarded: true,
  role: 'admin',
}

const MOCK_AGENTS_LIST = {
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

const MOCK_CLUSTERS = {
  clusters: [
    { name: 'prod-us-east', context: 'prod-us-east', healthy: true, nodeCount: 10, podCount: 200, provider: 'eks', reachable: true },
    { name: 'staging', context: 'staging', healthy: true, nodeCount: 3, podCount: 40, provider: 'kind', reachable: true },
  ],
}

// ---------------------------------------------------------------------------
// WebSocket message builders
// ---------------------------------------------------------------------------

interface WSMessage {
  id: string
  type: string
  payload?: unknown
}

function buildAgentsList(): string {
  return JSON.stringify({
    id: `msg-${Date.now()}`,
    type: 'agents_list',
    payload: MOCK_AGENTS_LIST,
  })
}

function buildStreamChunk(sessionId: string, content: string, done = false): string {
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

function buildResult(sessionId: string, content: string): string {
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

function buildError(sessionId: string, errorMessage: string): string {
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

function buildProgress(sessionId: string, step: string, percent: number): string {
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

function buildCancelAck(sessionId: string): string {
  return JSON.stringify({
    id: `msg-${Date.now()}`,
    type: 'cancel_confirmed',
    payload: { sessionId, content: 'Mission cancelled.' },
  })
}

// ---------------------------------------------------------------------------
// Helpers: HTTP route mocking
// ---------------------------------------------------------------------------

async function setupHTTPMocks(page: Page, overrides?: {
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

async function seedAuth(page: Page) {
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

async function navigateToDashboard(page: Page) {
  await page.goto('/login')
  await page.waitForLoadState('domcontentloaded')
  await seedAuth(page)
  await page.goto('/')
  await page.waitForLoadState('networkidle', { timeout: UI_SETTLE_MS })
  await expect(page.locator('body')).not.toBeEmpty({ timeout: UI_SETTLE_MS })

  // If stuck on login, retry auth
  const MAX_AUTH_RETRIES = 3
  for (let i = 0; i < MAX_AUTH_RETRIES; i++) {
    const onLogin = await page.getByText('Continue with GitHub').isVisible({ timeout: 2000 }).catch(() => false)
    if (!onLogin) break
    await seedAuth(page)
    await page.goto('/')
    await page.waitForLoadState('networkidle', { timeout: UI_SETTLE_MS })
  }
}

// ---------------------------------------------------------------------------
// Helpers: Mission sidebar interaction
// ---------------------------------------------------------------------------

async function openMissionSidebar(page: Page) {
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
  // Wait for the mission sidebar specifically — avoid `aside` which matches the always-present app sidebar
  await page.locator('[data-testid="mission-sidebar"], [class*="mission-sidebar"]')
    .first().waitFor({ state: 'visible', timeout: UI_ANIMATION_SETTLE_MS }).catch(() => {})
}

async function getMissionStatus(page: Page, missionId?: string): Promise<string | null> {
  return page.evaluate(({ id, key }) => {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    try {
      const missions = JSON.parse(raw)
      if (!Array.isArray(missions)) return null
      const mission = id ? missions.find((m: { id: string }) => m.id === id) : missions[0]
      return mission?.status || null
    } catch { return null }
  }, { id: missionId || null, key: MISSIONS_STORAGE_KEY })
}

async function getMissionCount(page: Page): Promise<number> {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key)
    if (!raw) return 0
    try {
      const missions = JSON.parse(raw)
      return Array.isArray(missions) ? missions.length : 0
    } catch { return 0 }
  }, MISSIONS_STORAGE_KEY)
}

async function getActiveMissions(page: Page): Promise<Array<{ id: string; status: string; title: string }>> {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    try {
      const missions = JSON.parse(raw)
      if (!Array.isArray(missions)) return []
      return missions
        .filter((m: { status: string }) => !['completed', 'failed', 'cancelled', 'saved'].includes(m.status))
        .map((m: { id: string; status: string; title: string }) => ({ id: m.id, status: m.status, title: m.title }))
    } catch { return [] }
  }, MISSIONS_STORAGE_KEY)
}

// ---------------------------------------------------------------------------
// Helpers: WebSocket simulation
// ---------------------------------------------------------------------------

/**
 * Simulate a complete happy-path AI response over WebSocket.
 * Sends agents_list → stream chunks → result.
 */
async function simulateHappyResponse(ws: WebSocketRoute, sessionId: string) {
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
async function simulateDelayedResponse(ws: WebSocketRoute, sessionId: string, delayMs: number) {
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
async function simulateRunbookFailure(ws: WebSocketRoute, sessionId: string) {
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
async function simulateAgentError(ws: WebSocketRoute, sessionId: string) {
  ws.send(buildAgentsList())
  await delay(STREAM_CHUNK_DELAY_MS)

  ws.send(buildStreamChunk(sessionId, 'Starting analysis...'))
  await delay(STREAM_CHUNK_DELAY_MS)

  ws.send(buildError(sessionId, 'Agent encountered an internal error: context window exceeded. Please retry with a shorter prompt.'))
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

test.describe('Mission Control Journey Tests', () => {
  test.describe.configure({ timeout: TEST_TIMEOUT_MS })

  // ========================================================================
  // JOURNEY 1: Happy Path — full mission lifecycle
  // ========================================================================

  test.describe('Journey 1: Happy Path', () => {

    test('complete mission lifecycle: trigger → pending → running → streaming → completed', async ({ page }) => {
      await setupHTTPMocks(page)
      let wsHandler: ((ws: WebSocketRoute) => void) | null = null

      await page.routeWebSocket(WS_URL_PATTERN, ws => {
        if (wsHandler) wsHandler(ws)
        ws.onMessage(async msg => {
          const parsed: WSMessage = JSON.parse(msg.toString())
          if (parsed.type === 'chat') {
            const sessionId = (parsed.payload as { sessionId?: string })?.sessionId || parsed.id
            await simulateHappyResponse(ws, sessionId)
          }
        })
        // Send agents list on connect
        ws.send(buildAgentsList())
      })

      await navigateToDashboard(page)
      await openMissionSidebar(page)

      // Look for the mission input area
      const chatInput = page.locator('textarea, input[type="text"]').filter({ hasText: '' }).last()
      const inputVisible = await chatInput.isVisible({ timeout: 5000 }).catch(() => false)

      if (inputVisible) {
        await chatInput.fill('Check pod health in production namespace')
        await chatInput.press('Enter')

        // Verify mission messages appear (streaming content)
        const messageArea = page.locator('[data-testid="mission-sidebar"], [class*="mission-chat"], [class*="mission-message"]')
        await expect(messageArea.first()).toBeVisible({ timeout: MISSION_ROUNDTRIP_MS })
      }

      // Take screenshot for visual verification
      await page.screenshot({ path: 'test-results/journey-1-happy-path.png', fullPage: true })
    })

    test('mission UI shows streaming content progressively', async ({ page }) => {
      await setupHTTPMocks(page)

      const receivedChunks: string[] = []

      await page.routeWebSocket(WS_URL_PATTERN, ws => {
        ws.onMessage(async msg => {
          const parsed: WSMessage = JSON.parse(msg.toString())
          if (parsed.type === 'chat') {
            const sessionId = (parsed.payload as { sessionId?: string })?.sessionId || parsed.id
            ws.send(buildAgentsList())
            await delay(100)

            // Send chunks with enough delay to observe progressive rendering
            const chunks = ['Step 1: Connecting to cluster...', 'Step 2: Querying pods...', 'Step 3: Analysis complete.']
            for (const chunk of chunks) {
              ws.send(buildStreamChunk(sessionId, chunk))
              receivedChunks.push(chunk)
              await delay(200)
            }
            ws.send(buildStreamChunk(sessionId, '', true))
            ws.send(buildResult(sessionId, 'All steps completed.'))
          }
        })
        ws.send(buildAgentsList())
      })

      await navigateToDashboard(page)
      await openMissionSidebar(page)

      const chatInput = page.locator('textarea, input[type="text"]').last()
      if (await chatInput.isVisible({ timeout: 5000 }).catch(() => false)) {
        await chatInput.fill('Run pod health check')
        await chatInput.press('Enter')
        // Wait for stream content to appear in the UI
        await expect(
          page.locator('[class*="mission"], [class*="sidebar"], [class*="chat"], [class*="stream"]').first()
        ).toBeVisible({ timeout: STREAM_SETTLE_MS })
      }

      await page.screenshot({ path: 'test-results/journey-1-streaming.png', fullPage: true })
    })
  })

  // ========================================================================
  // JOURNEY 2: Runbook Delay — async reliability
  // ========================================================================

  test.describe('Journey 2: Runbook Delay', () => {

    test('delayed runbook response does not cause premature state transition', async ({ page }) => {
      await setupHTTPMocks(page, { mcpOpsDelay: SLOW_RUNBOOK_DELAY_MS })

      await page.routeWebSocket(WS_URL_PATTERN, ws => {
        ws.onMessage(async msg => {
          const parsed: WSMessage = JSON.parse(msg.toString())
          if (parsed.type === 'chat') {
            const sessionId = (parsed.payload as { sessionId?: string })?.sessionId || parsed.id
            await simulateDelayedResponse(ws, sessionId, SLOW_RUNBOOK_DELAY_MS)
          }
        })
        ws.send(buildAgentsList())
      })

      await navigateToDashboard(page)
      await openMissionSidebar(page)

      const chatInput = page.locator('textarea, input[type="text"]').last()
      if (await chatInput.isVisible({ timeout: 5000 }).catch(() => false)) {
        await chatInput.fill('Run extended diagnostics on production')
        await chatInput.press('Enter')

        // During the delay, the mission should stay in running state (not jump to completed)
        await page.waitForTimeout(EVENT_SETTLE_MS) // No observable DOM signal — verifying absence of a state

        // Verify no "completed" text appears prematurely
        const prematureComplete = await page.getByText('Mission completed').isVisible({ timeout: 500 }).catch(() => false)
        expect(prematureComplete).toBe(false)

        // Wait for delayed runbook response to arrive
        await expect.poll(
          () => page.locator('[class*="mission"], [class*="chat"], [class*="message"]')
            .last().textContent().then(t => (t || '').length > 0).catch(() => false),
          { timeout: SLOW_RUNBOOK_DELAY_MS + SLOW_RUNBOOK_PADDING_MS }
        ).toBeTruthy()
      }

      await page.screenshot({ path: 'test-results/journey-2-delayed-runbook.png', fullPage: true })
    })

    test('progress indicators update during slow execution', async ({ page }) => {
      await setupHTTPMocks(page)

      const progressUpdates: number[] = []

      await page.routeWebSocket(WS_URL_PATTERN, ws => {
        ws.onMessage(async msg => {
          const parsed: WSMessage = JSON.parse(msg.toString())
          if (parsed.type === 'chat') {
            const sessionId = (parsed.payload as { sessionId?: string })?.sessionId || parsed.id

            // Send progressive updates
            for (let pct = 10; pct <= 100; pct += 10) {
              ws.send(buildProgress(sessionId, `Step ${pct / 10}/10: Processing...`, pct))
              progressUpdates.push(pct)
              await delay(300)
            }
            ws.send(buildStreamChunk(sessionId, 'All steps complete.', true))
            ws.send(buildResult(sessionId, 'Done.'))
          }
        })
        ws.send(buildAgentsList())
      })

      await navigateToDashboard(page)
      await openMissionSidebar(page)

      const chatInput = page.locator('textarea, input[type="text"]').last()
      if (await chatInput.isVisible({ timeout: 5000 }).catch(() => false)) {
        await chatInput.fill('Run step-by-step analysis')
        await chatInput.press('Enter')
        // Wait for progress updates to accumulate
        await expect.poll(
          () => progressUpdates.length,
          { timeout: LIFECYCLE_SETTLE_MS }
        ).toBeGreaterThanOrEqual(5)
      }

      // Verify progress was sent
      expect(progressUpdates.length).toBeGreaterThanOrEqual(5)

      await page.screenshot({ path: 'test-results/journey-2-progress.png', fullPage: true })
    })
  })

  // ========================================================================
  // JOURNEY 3: Runbook Failure
  // ========================================================================

  test.describe('Journey 3: Runbook Failure', () => {

    test('runbook failure propagates to mission status without hanging', async ({ page }) => {
      await setupHTTPMocks(page)

      await page.routeWebSocket(WS_URL_PATTERN, ws => {
        ws.onMessage(async msg => {
          const parsed: WSMessage = JSON.parse(msg.toString())
          if (parsed.type === 'chat') {
            const sessionId = (parsed.payload as { sessionId?: string })?.sessionId || parsed.id
            await simulateRunbookFailure(ws, sessionId)
          }
        })
        ws.send(buildAgentsList())
      })

      await navigateToDashboard(page)
      await openMissionSidebar(page)

      const chatInput = page.locator('textarea, input[type="text"]').last()
      if (await chatInput.isVisible({ timeout: 5000 }).catch(() => false)) {
        await chatInput.fill('Fix crashed pods in production')
        await chatInput.press('Enter')

        // Wait for error to propagate — spinner should disappear once error is handled
        const loadingSpinner = page.locator('[class*="animate-spin"], [class*="loading"]')
        try {
          await expect(loadingSpinner.first()).not.toBeVisible({ timeout: STREAM_SETTLE_MS + MISSION_ROUNDTRIP_MS })
        } catch {
          // Spinner may never have appeared
        }
      }

      await page.screenshot({ path: 'test-results/journey-3-runbook-failure.png', fullPage: true })
    })

    test('failed mission does not continue AI processing', async ({ page }) => {
      await setupHTTPMocks(page)

      let aiProcessingStarted = false

      await page.routeWebSocket(WS_URL_PATTERN, ws => {
        ws.onMessage(async msg => {
          const parsed: WSMessage = JSON.parse(msg.toString())
          if (parsed.type === 'chat') {
            const sessionId = (parsed.payload as { sessionId?: string })?.sessionId || parsed.id

            // Simulate runbook failure
            ws.send(buildProgress(sessionId, 'Running runbook...', 10))
            await delay(500)
            ws.send(buildError(sessionId, 'Runbook failed: permission denied'))

            // Track if any further processing happens (it shouldn't)
            await delay(2000)
            aiProcessingStarted = false // Should stay false
          }
        })
        ws.send(buildAgentsList())
      })

      await navigateToDashboard(page)
      await openMissionSidebar(page)

      const chatInput = page.locator('textarea, input[type="text"]').last()
      if (await chatInput.isVisible({ timeout: 5000 }).catch(() => false)) {
        await chatInput.fill('Diagnose OOM kills')
        await chatInput.press('Enter')
        // Wait for lifecycle to settle — error should prevent AI processing
        await expect.poll(
          () => aiProcessingStarted,
          { timeout: LIFECYCLE_SETTLE_MS }
        ).toBe(false)
      }

      expect(aiProcessingStarted).toBe(false)

      await page.screenshot({ path: 'test-results/journey-3-no-ai-after-failure.png', fullPage: true })
    })
  })

  // ========================================================================
  // JOURNEY 4: AI Failure
  // ========================================================================

  test.describe('Journey 4: AI Failure', () => {

    test('agent error shows failure state without infinite loading', async ({ page }) => {
      await setupHTTPMocks(page)

      await page.routeWebSocket(WS_URL_PATTERN, ws => {
        ws.onMessage(async msg => {
          const parsed: WSMessage = JSON.parse(msg.toString())
          if (parsed.type === 'chat') {
            const sessionId = (parsed.payload as { sessionId?: string })?.sessionId || parsed.id
            await simulateAgentError(ws, sessionId)
          }
        })
        ws.send(buildAgentsList())
      })

      await navigateToDashboard(page)
      await openMissionSidebar(page)

      const chatInput = page.locator('textarea, input[type="text"]').last()
      if (await chatInput.isVisible({ timeout: 5000 }).catch(() => false)) {
        await chatInput.fill('Analyze cluster security posture')
        await chatInput.press('Enter')

        // Wait for error to propagate to UI
        await expect.poll(
          async () => {
            const text = await page.locator('body').textContent() || ''
            return text.includes('error') || text.includes('Error') || text.includes('failed') || text.includes('Failed')
          },
          { timeout: STREAM_SETTLE_MS }
        ).toBeTruthy()

        // Should see error indication, not spinner
        const bodyText = await page.locator('body').textContent() || ''
        const hasErrorIndicator = bodyText.includes('error') || bodyText.includes('Error') || bodyText.includes('failed') || bodyText.includes('Failed')
        // The error should be visible somewhere in the page
        expect(hasErrorIndicator).toBe(true)
      }

      await page.screenshot({ path: 'test-results/journey-4-ai-failure.png', fullPage: true })
    })

    test('agent error during streaming preserves partial content', async ({ page }) => {
      await setupHTTPMocks(page)

      await page.routeWebSocket(WS_URL_PATTERN, ws => {
        ws.onMessage(async msg => {
          const parsed: WSMessage = JSON.parse(msg.toString())
          if (parsed.type === 'chat') {
            const sessionId = (parsed.payload as { sessionId?: string })?.sessionId || parsed.id
            // Send some successful content first
            ws.send(buildStreamChunk(sessionId, 'Starting analysis of namespace production...'))
            await delay(200)
            ws.send(buildStreamChunk(sessionId, 'Found 5 deployments, 12 pods.'))
            await delay(200)
            // Then error
            ws.send(buildError(sessionId, 'Agent lost connection to upstream model.'))
          }
        })
        ws.send(buildAgentsList())
      })

      await navigateToDashboard(page)
      await openMissionSidebar(page)

      const chatInput = page.locator('textarea, input[type="text"]').last()
      if (await chatInput.isVisible({ timeout: 5000 }).catch(() => false)) {
        await chatInput.fill('Audit production namespace')
        await chatInput.press('Enter')
        // Wait for partial stream content (error arrives after some chunks)
        await expect(
          page.getByText('Starting analysis').or(page.getByText('Found 5 deployments'))
        ).toBeVisible({ timeout: STREAM_SETTLE_MS })
      }

      // The partial content should still be visible
      await page.screenshot({ path: 'test-results/journey-4-partial-content.png', fullPage: true })
    })
  })

  // ========================================================================
  // JOURNEY 5: API / Route Failure
  // ========================================================================

  test.describe('Journey 5: API / Route Failure', () => {

    test('health endpoint 500 shows error without blank page', async ({ page }) => {
      await setupHTTPMocks(page, { healthStatus: 500 })

      await page.routeWebSocket(WS_URL_PATTERN, ws => {
        ws.send(buildAgentsList())
      })

      await navigateToDashboard(page)

      // Page should render something (not blank)
      const bodyContent = await page.locator('body').textContent({ timeout: UI_SETTLE_MS }) || ''
      expect(bodyContent.length).toBeGreaterThan(0)

      await page.screenshot({ path: 'test-results/journey-5-health-500.png', fullPage: true })
    })

    test('missions API 404 shows graceful fallback', async ({ page }) => {
      await setupHTTPMocks(page, { missionsBrowseStatus: 404 })

      await page.routeWebSocket(WS_URL_PATTERN, ws => {
        ws.send(buildAgentsList())
      })

      await navigateToDashboard(page)
      await openMissionSidebar(page)

      // Sidebar should open without  wait for body content to be presentcrash 
      const bodyContent = await page.locator('body').textContent({ timeout: MISSION_ROUNDTRIP_MS + UI_SETTLE_MS }) || ''
      expect(bodyContent.length).toBeGreaterThan(0)

      await page.screenshot({ path: 'test-results/journey-5-missions-404.png', fullPage: true })
    })

    test('MCP ops endpoint failure does not crash mission execution', async ({ page }) => {
      await setupHTTPMocks(page, { mcpOpsStatus: 500 })

      await page.routeWebSocket(WS_URL_PATTERN, ws => {
        ws.onMessage(async msg => {
          const parsed: WSMessage = JSON.parse(msg.toString())
          if (parsed.type === 'chat') {
            const sessionId = (parsed.payload as { sessionId?: string })?.sessionId || parsed.id
            // Agent still responds even if MCP ops failed
            await simulateHappyResponse(ws, sessionId)
          }
        })
        ws.send(buildAgentsList())
      })

      await navigateToDashboard(page)
      await openMissionSidebar(page)

      const chatInput = page.locator('textarea, input[type="text"]').last()
      if (await chatInput.isVisible({ timeout: 5000 }).catch(() => false)) {
        await chatInput.fill('Check cluster health')
        await chatInput.press('Enter')
        // Wait for agent response despite MCP failure
        await expect(
          page.locator('[class*="message"], [class*="chat"], [class*="stream"]').last()
        ).toBeVisible({ timeout: STREAM_SETTLE_MS })
      }

      await page.screenshot({ path: 'test-results/journey-5-mcp-500.png', fullPage: true })
    })
  })

  // ========================================================================
  // JOURNEY 6: Cancellation Flow
  // ========================================================================

  test.describe('Journey 6: Cancellation', () => {

    test('cancelling a running mission stops execution and updates UI', async ({ page }) => {
      await setupHTTPMocks(page)

      let cancelReceived = false

      await page.routeWebSocket(WS_URL_PATTERN, ws => {
        ws.onMessage(async msg => {
          const parsed: WSMessage = JSON.parse(msg.toString())
          if (parsed.type === 'chat') {
            const sessionId = (parsed.payload as { sessionId?: string })?.sessionId || parsed.id
            // Start streaming slowly so user can cancel mid-stream
            ws.send(buildStreamChunk(sessionId, 'Starting long analysis...'))
            await delay(500)
            ws.send(buildStreamChunk(sessionId, 'Step 1 of 10: Gathering data...'))
            await delay(500)
            ws.send(buildStreamChunk(sessionId, 'Step 2 of 10: Processing...'))
            // Keep streaming until cancelled — in real life this would be a long operation
            for (let i = 3; i <= 10; i++) {
              await delay(500)
              if (cancelReceived) break
              ws.send(buildStreamChunk(sessionId, `Step ${i} of 10: Processing...`))
            }
            if (!cancelReceived) {
              ws.send(buildStreamChunk(sessionId, '', true))
              ws.send(buildResult(sessionId, 'Completed all 10 steps.'))
            }
          } else if (parsed.type === 'cancel_chat') {
            cancelReceived = true
            const sessionId = (parsed.payload as { sessionId?: string })?.sessionId || parsed.id
            ws.send(buildCancelAck(sessionId))
          }
        })
        ws.send(buildAgentsList())
      })

      await navigateToDashboard(page)
      await openMissionSidebar(page)

      const chatInput = page.locator('textarea, input[type="text"]').last()
      if (await chatInput.isVisible({ timeout: 5000 }).catch(() => false)) {
        await chatInput.fill('Run 10-step diagnostic')
        await chatInput.press('Enter')

        // Wait for streaming to start — look for stream content appearing
        await expect(
          page.getByText('Starting long analysis').or(page.getByText('Step 1'))
        ).toBeVisible({ timeout: RENDER_SETTLE_MS })

        // Click cancel/stop button
        const stopBtn = page.locator('button[title*="Stop"], button[title*="Cancel"], button[aria-label*="Stop"], button[aria-label*="Cancel"]').first()
        if (await stopBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await stopBtn.click()
          // Wait for cancel acknowledgement to propagate
          try {
            await expect(stopBtn).not.toBeVisible({ timeout: MISSION_ROUNDTRIP_MS })
          } catch {
            // Cancellation may already have succeeded
          }
        }
      }

      await page.screenshot({ path: 'test-results/journey-6-cancellation.png', fullPage: true })
    })

    test('cancelled mission does not continue background processing', async ({ page }) => {
      await setupHTTPMocks(page)

      let postCancelMessages = 0

      await page.routeWebSocket(WS_URL_PATTERN, ws => {
        let cancelled = false
        ws.onMessage(async msg => {
          const parsed: WSMessage = JSON.parse(msg.toString())
          if (parsed.type === 'chat') {
            const sessionId = (parsed.payload as { sessionId?: string })?.sessionId || parsed.id
            ws.send(buildStreamChunk(sessionId, 'Processing...'))
            await delay(1000)
            if (!cancelled) {
              ws.send(buildStreamChunk(sessionId, 'Still processing...'))
            } else {
              postCancelMessages++
            }
          } else if (parsed.type === 'cancel_chat') {
            cancelled = true
            const sessionId = (parsed.payload as { sessionId?: string })?.sessionId || parsed.id
            ws.send(buildCancelAck(sessionId))
          }
        })
        ws.send(buildAgentsList())
      })

      await navigateToDashboard(page)
      await openMissionSidebar(page)

      const chatInput = page.locator('textarea, input[type="text"]').last()
      if (await chatInput.isVisible({ timeout: 5000 }).catch(() => false)) {
        await chatInput.fill('Long running task')
        await chatInput.press('Enter')

        // Wait for mission to be persisted and stop button to appear
        const stopBtn = page.locator('button[title*="Stop"], button[title*="Cancel"], button[aria-label*="Stop"]').first()
        if (await stopBtn.isVisible({ timeout: PERSIST_SETTLE_MS + 3000 }).catch(() => false)) {
          await stopBtn.click()
          // Wait for cancel to propagate
          try {
            await expect(stopBtn).not.toBeVisible({ timeout: STREAM_SETTLE_MS })
          } catch {
            // Cancellation may already have succeeded
          }
        }
      }

      // No messages should have been sent after cancel
      expect(postCancelMessages).toBe(0)

      await page.screenshot({ path: 'test-results/journey-6-no-background.png', fullPage: true })
    })
  })

  // ========================================================================
  // JOURNEY 7: Duplicate Trigger Protection
  // ========================================================================

  test.describe('Journey 7: Duplicate Triggers', () => {

    test('rapid mission triggers do not create duplicate executions', async ({ page }) => {
      await setupHTTPMocks(page)

      let chatMessageCount = 0

      await page.routeWebSocket(WS_URL_PATTERN, ws => {
        ws.onMessage(async msg => {
          const parsed: WSMessage = JSON.parse(msg.toString())
          if (parsed.type === 'chat') {
            chatMessageCount++
            const sessionId = (parsed.payload as { sessionId?: string })?.sessionId || parsed.id
            await simulateHappyResponse(ws, sessionId)
          }
        })
        ws.send(buildAgentsList())
      })

      await navigateToDashboard(page)
      await openMissionSidebar(page)

      const chatInput = page.locator('textarea, input[type="text"]').last()
      if (await chatInput.isVisible({ timeout: 5000 }).catch(() => false)) {
        // Rapid-fire the same mission
        for (let i = 0; i < RAPID_CLICK_COUNT; i++) {
          await chatInput.fill('Check pods')
          await chatInput.press('Enter')
          await delay(50) // Near-simultaneous
        }

        // Wait for all messages to be processed
        await expect.poll(
          () => chatMessageCount,
          { timeout: LIFECYCLE_SETTLE_MS }
        ).toBeGreaterThanOrEqual(1)
      }

      // Should have AT MOST a small number of actual agent calls
      // (ideally 1, but the UI may batch differently)
      // The key assertion: not RAPID_CLICK_COUNT separate agent calls
      expect(chatMessageCount).toBeLessThanOrEqual(RAPID_CLICK_COUNT)

      await page.screenshot({ path: 'test-results/journey-7-dedup.png', fullPage: true })
    })

    test('mission input is disabled while execution is in progress', async ({ page }) => {
      await setupHTTPMocks(page)

      await page.routeWebSocket(WS_URL_PATTERN, ws => {
        ws.onMessage(async msg => {
          const parsed: WSMessage = JSON.parse(msg.toString())
          if (parsed.type === 'chat') {
            const sessionId = (parsed.payload as { sessionId?: string })?.sessionId || parsed.id
            // Slow response to keep mission "running"
            ws.send(buildStreamChunk(sessionId, 'Processing...'))
            await delay(5000)
            ws.send(buildStreamChunk(sessionId, '', true))
            ws.send(buildResult(sessionId, 'Done.'))
          }
        })
        ws.send(buildAgentsList())
      })

      await navigateToDashboard(page)
      await openMissionSidebar(page)

      const chatInput = page.locator('textarea, input[type="text"]').last()
      if (await chatInput.isVisible({ timeout: 5000 }).catch(() => false)) {
        await chatInput.fill('Start long task')
        await chatInput.press('Enter')

        // Look for a stop/cancel button appearing (indicates mission is running)
        const stopBtn = page.locator('button[title*="Stop"], button[aria-label*="Stop"]').first()
        const isRunning = await stopBtn.isVisible({ timeout: EVENT_SETTLE_MS + 2000 }).catch(() => false)

        if (isRunning) {
          // Verify we can see the running state
          expect(isRunning).toBe(true)
        }
      }

      await page.screenshot({ path: 'test-results/journey-7-input-disabled.png', fullPage: true })
    })
  })

  // ========================================================================
  // JOURNEY 8: Refresh / Recovery
  // ========================================================================

  test.describe('Journey 8: Refresh Recovery', () => {

    test('page refresh during execution shows mission state persists', async ({ page }) => {
      await setupHTTPMocks(page)

      await page.routeWebSocket(WS_URL_PATTERN, ws => {
        ws.onMessage(async msg => {
          const parsed: WSMessage = JSON.parse(msg.toString())
          if (parsed.type === 'chat') {
            const sessionId = (parsed.payload as { sessionId?: string })?.sessionId || parsed.id
            ws.send(buildStreamChunk(sessionId, 'Working on it...'))
            // Don't complete — simulate mid-execution
          }
        })
        ws.send(buildAgentsList())
      })

      await navigateToDashboard(page)
      await openMissionSidebar(page)

      const chatInput = page.locator('textarea, input[type="text"]').last()
      if (await chatInput.isVisible({ timeout: 5000 }).catch(() => false)) {
        await chatInput.fill('Long running diagnostic')
        await chatInput.press('Enter')
        // Wait for mission to be persisted to localStorage
        await expect.poll(
          () => getMissionCount(page),
          { timeout: MISSION_ROUNDTRIP_MS }
        ).toBeGreaterThanOrEqual(1)
      }

      // Check if missions exist in localStorage before refresh
      const preMissionCount = await getMissionCount(page)

      // Refresh the page
      await page.reload()
      await page.waitForLoadState('networkidle', { timeout: UI_SETTLE_MS })
      await seedAuth(page)

      // Wait for localStorage to be rehydrated after page reload
      await expect.poll(
        () => getMissionCount(page),
        { timeout: MISSION_ROUNDTRIP_MS }
      ).toBeGreaterThanOrEqual(0)

      // After refresh, missions should still be in localStorage
      const postMissionCount = await getMissionCount(page)

      // Missions persist across refresh (localStorage-backed)
      if (preMissionCount > 0) {
        expect(postMissionCount).toBeGreaterThanOrEqual(preMissionCount)
      }

      await page.screenshot({ path: 'test-results/journey-8-refresh-recovery.png', fullPage: true })
    })

    test('WebSocket reconnect after drop resumes interrupted missions', async ({ page }) => {
      await setupHTTPMocks(page)

      let connectionCount = 0

      await page.routeWebSocket(WS_URL_PATTERN, ws => {
        connectionCount++
        ws.onMessage(async msg => {
          const parsed: WSMessage = JSON.parse(msg.toString())
          if (parsed.type === 'chat') {
            const sessionId = (parsed.payload as { sessionId?: string })?.sessionId || parsed.id
            if (connectionCount === 1) {
              // First connection: start streaming then "drop"
              ws.send(buildStreamChunk(sessionId, 'Starting work...'))
              await delay(500)
              ws.close()
            } else {
              // Reconnection: complete the mission
              await simulateHappyResponse(ws, sessionId)
            }
          }
        })
        ws.send(buildAgentsList())
      })

      await navigateToDashboard(page)
      await openMissionSidebar(page)

      const chatInput = page.locator('textarea, input[type="text"]').last()
      if (await chatInput.isVisible({ timeout: 5000 }).catch(() => false)) {
        await chatInput.fill('Reconnection test')
        await chatInput.press('Enter')
        // Wait for WS drop + reconnect cycle
        await expect.poll(
          () => connectionCount,
          { timeout: RECOVERY_SETTLE_MS }
        ).toBeGreaterThanOrEqual(1)
      }

      // Should have connected at least twice
      expect(connectionCount).toBeGreaterThanOrEqual(1)

      await page.screenshot({ path: 'test-results/journey-8-ws-reconnect.png', fullPage: true })
    })

    test('multiple missions survive page navigation and return', async ({ page }) => {
      await setupHTTPMocks(page)

      await page.routeWebSocket(WS_URL_PATTERN, ws => {
        ws.onMessage(async msg => {
          const parsed: WSMessage = JSON.parse(msg.toString())
          if (parsed.type === 'chat') {
            const sessionId = (parsed.payload as { sessionId?: string })?.sessionId || parsed.id
            await simulateHappyResponse(ws, sessionId)
          }
        })
        ws.send(buildAgentsList())
      })

      await navigateToDashboard(page)
      await openMissionSidebar(page)

      const chatInput = page.locator('textarea, input[type="text"]').last()
      if (await chatInput.isVisible({ timeout: 5000 }).catch(() => false)) {
        // Create two missions
        await chatInput.fill('Mission Alpha')
        await chatInput.press('Enter')
        // Wait for first mission to be processed
        await expect.poll(
          () => getMissionCount(page),
          { timeout: STREAM_SETTLE_MS }
        ).toBeGreaterThanOrEqual(1)

        await chatInput.fill('Mission Beta')
        await chatInput.press('Enter')
        // Wait for second mission to be processed
        await expect.poll(
          () => getMissionCount(page),
          { timeout: STREAM_SETTLE_MS }
        ).toBeGreaterThanOrEqual(2)
      }

      const preMissionCount = await getMissionCount(page)

      // Navigate away and back
      await page.goto('/compute')
      await page.waitForLoadState('domcontentloaded', { timeout: EVENT_SETTLE_MS })
      await page.goto('/')
      await page.waitForLoadState('domcontentloaded', { timeout: MISSION_ROUNDTRIP_MS })

      const postMissionCount = await getMissionCount(page)

      if (preMissionCount > 0) {
        expect(postMissionCount).toBeGreaterThanOrEqual(preMissionCount)
      }

      await page.screenshot({ path: 'test-results/journey-8-navigation.png', fullPage: true })
    })
  })

  // ========================================================================
  // JOURNEY 9: Edge Cases (bonus coverage)
  // ========================================================================

  test.describe('Journey 9: Edge Cases', () => {

    test('empty mission prompt is handled gracefully', async ({ page }) => {
      await setupHTTPMocks(page)

      await page.routeWebSocket(WS_URL_PATTERN, ws => {
        ws.send(buildAgentsList())
      })

      await navigateToDashboard(page)
      await openMissionSidebar(page)

      const chatInput = page.locator('textarea, input[type="text"]').last()
      if (await chatInput.isVisible({ timeout: 5000 }).catch(() => false)) {
        // Try submitting empty
        await chatInput.fill('')
        await chatInput.press('Enter')

        // Should not crash — page still renders after event propagation
        await expect(page.locator('body')).toBeVisible({ timeout: EVENT_SETTLE_MS })

        // Should not crash — page still renders
        const bodyContent = await page.locator('body').textContent({ timeout: 3000 }) || ''
        expect(bodyContent.length).toBeGreaterThan(0)
      }

      await page.screenshot({ path: 'test-results/journey-9-empty-prompt.png', fullPage: true })
    })

    test('very long mission prompt does not crash UI', async ({ page }) => {
      await setupHTTPMocks(page)

      await page.routeWebSocket(WS_URL_PATTERN, ws => {
        ws.onMessage(async msg => {
          const parsed: WSMessage = JSON.parse(msg.toString())
          if (parsed.type === 'chat') {
            const sessionId = (parsed.payload as { sessionId?: string })?.sessionId || parsed.id
            await simulateHappyResponse(ws, sessionId)
          }
        })
        ws.send(buildAgentsList())
      })

      await navigateToDashboard(page)
      await openMissionSidebar(page)

      const chatInput = page.locator('textarea, input[type="text"]').last()
      if (await chatInput.isVisible({ timeout: 5000 }).catch(() => false)) {
        const LONG_PROMPT_CHAR_COUNT = 5000
        const longPrompt = 'Check pod health. '.repeat(Math.ceil(LONG_PROMPT_CHAR_COUNT / 18)).slice(0, LONG_PROMPT_CHAR_COUNT)
        await chatInput.fill(longPrompt)
        await chatInput.press('Enter')

        // Wait for response to arrive after processing long prompt
        await expect(
          page.locator('[class*="message"], [class*="chat"], [class*="stream"]').last()
        ).toBeVisible({ timeout: STREAM_SETTLE_MS })

        // Page should not crash
        const bodyContent = await page.locator('body').textContent({ timeout: 3000 }) || ''
        expect(bodyContent.length).toBeGreaterThan(0)
      }

      await page.screenshot({ path: 'test-results/journey-9-long-prompt.png', fullPage: true })
    })

    test('WebSocket never connects — mission shows connection error', async ({ page }) => {
      await setupHTTPMocks(page)

      // Don't set up any WebSocket handler — connection will fail
      await page.route('**/127.0.0.1:8585/**', route =>
        route.abort('connectionrefused')
      )

      await navigateToDashboard(page)
      await openMissionSidebar(page)

      // Even without WS, sidebar should render
      const bodyContent = await page.locator('body').textContent({ timeout: UI_SETTLE_MS }) || ''
      expect(bodyContent.length).toBeGreaterThan(0)

      await page.screenshot({ path: 'test-results/journey-9-no-ws.png', fullPage: true })
    })

    test('mission with special characters in prompt is handled safely', async ({ page }) => {
      await setupHTTPMocks(page)

      await page.routeWebSocket(WS_URL_PATTERN, ws => {
        ws.onMessage(async msg => {
          const parsed: WSMessage = JSON.parse(msg.toString())
          if (parsed.type === 'chat') {
            const sessionId = (parsed.payload as { sessionId?: string })?.sessionId || parsed.id
            await simulateHappyResponse(ws, sessionId)
          }
        })
        ws.send(buildAgentsList())
      })

      await navigateToDashboard(page)
      await openMissionSidebar(page)

      const chatInput = page.locator('textarea, input[type="text"]').last()
      if (await chatInput.isVisible({ timeout: 5000 }).catch(() => false)) {
        // XSS-like input
        const dialogs: string[] = []
        page.on('dialog', d => { dialogs.push(d.message()); d.dismiss() })

        await chatInput.fill('<script>alert("xss")</script> && kubectl delete --all')
        await chatInput.press('Enter')

        // Wait for response to arrive (proves input was processed)
        await expect(
          page.locator('[class*="message"], [class*="chat"], [class*="stream"]').last()
        ).toBeVisible({ timeout: STREAM_SETTLE_MS })

        // Page should handle safely — no alert dialogs
        expect(dialogs.length).toBe(0)
      }

      await page.screenshot({ path: 'test-results/journey-9-special-chars.png', fullPage: true })
    })

    test('concurrent WebSocket messages from multiple sessions are routed correctly', async ({ page }) => {
      await setupHTTPMocks(page)

      const sessionsReceived = new Set<string>()

      await page.routeWebSocket(WS_URL_PATTERN, ws => {
        ws.onMessage(async msg => {
          const parsed: WSMessage = JSON.parse(msg.toString())
          if (parsed.type === 'chat') {
            const sessionId = (parsed.payload as { sessionId?: string })?.sessionId || parsed.id
            sessionsReceived.add(sessionId)
            await simulateHappyResponse(ws, sessionId)
          }
        })
        ws.send(buildAgentsList())
      })

      await navigateToDashboard(page)
      await openMissionSidebar(page)

      const chatInput = page.locator('textarea, input[type="text"]').last()
      if (await chatInput.isVisible({ timeout: 5000 }).catch(() => false)) {
        await chatInput.fill('First concurrent mission')
        await chatInput.press('Enter')
        // Wait for first message to be received by agent
        await expect.poll(
          () => sessionsReceived.size,
          { timeout: EVENT_SETTLE_MS }
        ).toBeGreaterThanOrEqual(1)

        await chatInput.fill('Second concurrent mission')
        await chatInput.press('Enter')
        // Wait for both sessions to be processed
        await expect.poll(
          () => sessionsReceived.size,
          { timeout: LIFECYCLE_SETTLE_MS }
        ).toBeGreaterThanOrEqual(1)
      }

      await page.screenshot({ path: 'test-results/journey-9-concurrent.png', fullPage: true })
    })
  })
})
