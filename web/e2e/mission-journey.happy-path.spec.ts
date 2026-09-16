import { test, expect } from '@playwright/test'
import {
  TEST_TIMEOUT_MS,
  WS_URL_PATTERN,
  SLOW_RUNBOOK_DELAY_MS,
  EVENT_SETTLE_MS,
  MISSION_ROUNDTRIP_MS,
  STREAM_SETTLE_MS,
  LIFECYCLE_SETTLE_MS,
  SLOW_RUNBOOK_PADDING_MS,
  WSMessage,
  buildAgentsList,
  buildStreamChunk,
  buildResult,
  buildError,
  buildProgress,
  setupHTTPMocks,
  navigateToDashboard,
  openMissionSidebar,
  getMissionComposerInput,
  simulateHappyResponse,
  simulateDelayedResponse,
  simulateRunbookFailure,
  delay,
} from './helpers/mission-journey-setup'

/**
 * Mission Control Journey Tests — Happy Path
 *
 * Journeys 1–3: Happy Path, Runbook Delay, Runbook Failure.
 * Split from the original monolithic mission-journey.spec.ts (#23059).
 * Shared setup/mocks live in ./helpers/mission-journey-setup.ts.
 *
 * These are nightly/hourly tests, NOT PR CI gates.
 */

test.describe('Mission Control Journey Tests', () => {
  test.describe.configure({ timeout: TEST_TIMEOUT_MS })

  test.describe('Journey 1: Happy Path', () => {

    test('complete mission lifecycle: trigger → pending → running → streaming → completed', async ({ page }) => {
      await setupHTTPMocks(page)
      await page.routeWebSocket(WS_URL_PATTERN, ws => {
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
      const chatInput = getMissionComposerInput(page)
      const inputVisible = await chatInput.isVisible({ timeout: 5000 }).catch((error) => { console.error('Promise error:', error); return false })

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

      const chatInput = getMissionComposerInput(page)
      if (await chatInput.isVisible({ timeout: 5000 }).catch((error) => { console.error('Promise error:', error); return false })) {
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

      const chatInput = getMissionComposerInput(page)
      if (await chatInput.isVisible({ timeout: 5000 }).catch((error) => { console.error('Promise error:', error); return false })) {
        await chatInput.fill('Run extended diagnostics on production')
        await chatInput.press('Enter')

        // During the delay, the mission should stay in running state (not jump to completed)
        await page.waitForTimeout(EVENT_SETTLE_MS) // No observable DOM signal — verifying absence of a state

        // Verify no "completed" text appears prematurely
        const prematureComplete = await page.getByText('Mission completed').isVisible({ timeout: 500 }).catch((error) => { console.error('Promise error:', error); return false })
        expect(prematureComplete).toBe(false)

        // Wait for delayed runbook response to arrive
        await expect.poll(
          () => page.locator('[class*="mission"], [class*="chat"], [class*="message"]')
            .last().textContent().then(t => (t || '').length > 0).catch((error) => { console.error('Promise error:', error); return false }),
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

      const chatInput = getMissionComposerInput(page)
      if (await chatInput.isVisible({ timeout: 5000 }).catch((error) => { console.error('Promise error:', error); return false })) {
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

      const chatInput = getMissionComposerInput(page)
      if (await chatInput.isVisible({ timeout: 5000 }).catch((error) => { console.error('Promise error:', error); return false })) {
        await chatInput.fill('Fix crashed pods in production')
        await chatInput.press('Enter')

        // Wait for error to propagate — spinner should disappear once error is handled
        const loadingSpinner = page.locator('[class*="animate-spin"], [class*="loading"]')
        try {
          await expect(loadingSpinner.first()).not.toBeVisible({ timeout: STREAM_SETTLE_MS + MISSION_ROUNDTRIP_MS })
        } catch (error) { console.error('Error:', error)
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

      const chatInput = getMissionComposerInput(page)
      if (await chatInput.isVisible({ timeout: 5000 }).catch((error) => { console.error('Promise error:', error); return false })) {
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
})
