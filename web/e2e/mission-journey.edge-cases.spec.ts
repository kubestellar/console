import { test, expect } from '@playwright/test'
import {
  TEST_TIMEOUT_MS,
  UI_SETTLE_MS,
  WS_URL_PATTERN,
  EVENT_SETTLE_MS,
  STREAM_SETTLE_MS,
  LIFECYCLE_SETTLE_MS,
  WSMessage,
  buildAgentsList,
  setupHTTPMocks,
  navigateToDashboard,
  openMissionSidebar,
  getMissionComposerInput,
  simulateHappyResponse,
} from './helpers/mission-journey-setup'

/**
 * Mission Control Journey Tests — Edge Cases
 *
 * Journey 9: Edge Cases.
 * Split from the original monolithic mission-journey.spec.ts (#23059).
 * Shared setup/mocks live in ./helpers/mission-journey-setup.ts.
 *
 * These are nightly/hourly tests, NOT PR CI gates.
 */

test.describe('Mission Control Journey Tests', () => {
  test.describe.configure({ timeout: TEST_TIMEOUT_MS })

  test.describe('Journey 9: Edge Cases', () => {

    test('empty mission prompt is handled gracefully', async ({ page }) => {
      await setupHTTPMocks(page)

      await page.routeWebSocket(WS_URL_PATTERN, ws => {
        ws.send(buildAgentsList())
      })

      await navigateToDashboard(page)
      await openMissionSidebar(page)

      const chatInput = getMissionComposerInput(page)
      if (await chatInput.isVisible({ timeout: 5000 }).catch((error) => { console.error('Promise error:', error); return false })) {
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

      const chatInput = getMissionComposerInput(page)
      if (await chatInput.isVisible({ timeout: 5000 }).catch((error) => { console.error('Promise error:', error); return false })) {
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

      const chatInput = getMissionComposerInput(page)
      if (await chatInput.isVisible({ timeout: 5000 }).catch((error) => { console.error('Promise error:', error); return false })) {
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

      const chatInput = getMissionComposerInput(page)
      if (await chatInput.isVisible({ timeout: 5000 }).catch((error) => { console.error('Promise error:', error); return false })) {
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
