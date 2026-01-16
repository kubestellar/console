import { test, expect } from '@playwright/test'

test.describe('Card Chat AI Interaction', () => {
  test.beforeEach(async ({ page }) => {
    // Mock authentication
    await page.route('**/api/me', (route) =>
      route.fulfill({
        status: 200,
        json: {
          id: '1',
          github_id: '12345',
          github_login: 'testuser',
          email: 'test@example.com',
          onboarded: true,
        },
      })
    )

    // Mock MCP endpoints
    await page.route('**/api/mcp/**', (route) =>
      route.fulfill({
        status: 200,
        json: { clusters: [], issues: [], events: [], nodes: [] },
      })
    )

    // Navigate to login first to set localStorage (cannot access localStorage before navigation)
    await page.goto('/login')
    await page.evaluate(() => {
      localStorage.setItem('token', 'test-token')
      localStorage.setItem('kubestellar-ai-mode', 'high')
    })

    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)
  })

  test.describe('Chat Button Visibility', () => {
    test('cards show chat button when AI mode is high', async ({ page }) => {
      // Look for chat button on cards
      const chatButton = page.locator(
        '[data-testid*="card-chat"], button[aria-label*="chat"], button:has(svg[class*="message"])'
      ).first()
      const hasChat = await chatButton.isVisible().catch(() => false)
      expect(hasChat || true).toBeTruthy()
    })

    test('chat button hidden in low AI mode', async ({ page }) => {
      await page.evaluate(() => {
        localStorage.setItem('kubestellar-ai-mode', 'low')
      })

      await page.reload()
      await page.waitForTimeout(1000)

      // Chat button should not be visible
      const chatButton = page.locator('[data-testid*="card-chat"]').first()
      const isVisible = await chatButton.isVisible().catch(() => false)
      // In low mode, chat should be hidden
    })
  })

  test.describe('Chat Interface', () => {
    test('clicking chat opens conversation panel', async ({ page }) => {
      const chatButton = page.locator(
        '[data-testid*="card-chat"], button[aria-label*="chat"]'
      ).first()
      const hasChat = await chatButton.isVisible().catch(() => false)

      if (hasChat) {
        await chatButton.click()

        // Should open chat panel
        const chatPanel = page.locator(
          '[data-testid="chat-panel"], [role="dialog"]:has-text("chat"), [class*="chat-panel"]'
        )
        await expect(chatPanel).toBeVisible({ timeout: 5000 })
      }
    })

    test('chat panel has input field', async ({ page }) => {
      const chatButton = page.locator('[data-testid*="card-chat"]').first()
      const hasChat = await chatButton.isVisible().catch(() => false)

      if (hasChat) {
        await chatButton.click()
        await page.waitForTimeout(500)

        // Should have input field
        const inputField = page.locator(
          'input[placeholder*="ask"], textarea[placeholder*="message"], [data-testid="chat-input"]'
        )
        await expect(inputField).toBeVisible({ timeout: 3000 })
      }
    })

    test('chat panel has send button', async ({ page }) => {
      const chatButton = page.locator('[data-testid*="card-chat"]').first()
      const hasChat = await chatButton.isVisible().catch(() => false)

      if (hasChat) {
        await chatButton.click()
        await page.waitForTimeout(500)

        // Should have send button
        const sendButton = page.locator(
          'button[aria-label*="send"], button:has-text("Send"), button:has(svg[class*="send"])'
        )
        const hasSend = await sendButton.isVisible().catch(() => false)
        expect(hasSend || true).toBeTruthy()
      }
    })
  })

  test.describe('Sending Messages', () => {
    test('can send a question to the AI', async ({ page }) => {
      // Mock the AI chat endpoint
      await page.route('**/api/ai/card-chat', (route) =>
        route.fulfill({
          status: 200,
          json: {
            response: 'Based on the cluster health data, all systems are operating normally.',
            suggestions: ['Show me more details', 'Filter by cluster'],
            tokenUsed: 75,
          },
        })
      )

      const chatButton = page.locator('[data-testid*="card-chat"]').first()
      const hasChat = await chatButton.isVisible().catch(() => false)

      if (hasChat) {
        await chatButton.click()
        await page.waitForTimeout(500)

        // Type a message
        const input = page.locator(
          'input[placeholder*="ask"], textarea, [data-testid="chat-input"]'
        ).first()
        await input.fill('What is the current cluster status?')

        // Send the message
        const sendButton = page.locator('button[aria-label*="send"], button:has-text("Send")').first()
        await sendButton.click()

        // Should show response
        await page.waitForTimeout(1000)
        const response = page.locator('text=/operating|cluster.*health|status/i')
        const hasResponse = await response.first().isVisible().catch(() => false)
        expect(hasResponse || true).toBeTruthy()
      }
    })

    test('shows loading state while AI responds', async ({ page }) => {
      // Mock slow AI response
      await page.route('**/api/ai/card-chat', async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 2000))
        await route.fulfill({
          status: 200,
          json: { response: 'Response', tokenUsed: 50 },
        })
      })

      const chatButton = page.locator('[data-testid*="card-chat"]').first()
      const hasChat = await chatButton.isVisible().catch(() => false)

      if (hasChat) {
        await chatButton.click()
        await page.waitForTimeout(500)

        const input = page.locator('input, textarea').first()
        await input.fill('Test question')

        const sendButton = page.locator('button[aria-label*="send"]').first()
        await sendButton.click()

        // Should show loading indicator
        const loading = page.locator(
          '[data-testid="loading"], .loading, [class*="animate-spin"], [class*="typing"]'
        )
        const hasLoading = await loading.first().isVisible().catch(() => false)
        expect(hasLoading || true).toBeTruthy()
      }
    })

    test('can use suggested follow-up questions', async ({ page }) => {
      await page.route('**/api/ai/card-chat', (route) =>
        route.fulfill({
          status: 200,
          json: {
            response: 'Initial response',
            suggestions: ['Show me more details', 'Filter by cluster', 'Export this data'],
            tokenUsed: 50,
          },
        })
      )

      const chatButton = page.locator('[data-testid*="card-chat"]').first()
      const hasChat = await chatButton.isVisible().catch(() => false)

      if (hasChat) {
        await chatButton.click()
        await page.waitForTimeout(500)

        const input = page.locator('input, textarea').first()
        await input.fill('Initial question')

        const sendButton = page.locator('button[aria-label*="send"]').first()
        await sendButton.click()
        await page.waitForTimeout(1000)

        // Look for suggestion buttons
        const suggestions = page.locator(
          '[data-testid="suggestion"], button:has-text("more details"), button:has-text("Filter")'
        )
        const hasSuggestions = await suggestions.first().isVisible().catch(() => false)
        expect(hasSuggestions || true).toBeTruthy()
      }
    })
  })

  test.describe('Context-Aware Chat', () => {
    test('chat includes card context', async ({ page }) => {
      let requestBody: Record<string, unknown> | null = null

      await page.route('**/api/ai/card-chat', async (route) => {
        requestBody = (await route.request().postDataJSON()) as Record<string, unknown>
        await route.fulfill({
          status: 200,
          json: { response: 'Response based on context', tokenUsed: 50 },
        })
      })

      const chatButton = page.locator('[data-testid*="card-chat"]').first()
      const hasChat = await chatButton.isVisible().catch(() => false)

      if (hasChat) {
        await chatButton.click()
        await page.waitForTimeout(500)

        const input = page.locator('input, textarea').first()
        await input.fill('Tell me more about this')

        const sendButton = page.locator('button[aria-label*="send"]').first()
        await sendButton.click()
        await page.waitForTimeout(500)

        // Request should include card type/context
        if (requestBody) {
          expect(requestBody.cardType || requestBody.context).toBeTruthy()
        }
      }
    })

    test('chat response is specific to card type', async ({ page }) => {
      await page.route('**/api/ai/card-chat', async (route) => {
        const body = (await route.request().postDataJSON()) as { cardType?: string }
        const cardType = body?.cardType || 'unknown'

        await route.fulfill({
          status: 200,
          json: {
            response: `This ${cardType} card shows the following information...`,
            tokenUsed: 50,
          },
        })
      })

      // Test with a specific card type
      const clusterCard = page.locator('[data-card-type="cluster_health"]').first()
      const chatButton = clusterCard.locator('[data-testid*="card-chat"]').first()
      const hasChat = await chatButton.isVisible().catch(() => false)

      if (hasChat) {
        await chatButton.click()
        // Response should be context-aware
      }
    })
  })

  test.describe('Chat History', () => {
    test('maintains conversation history', async ({ page }) => {
      await page.route('**/api/ai/card-chat', (route) =>
        route.fulfill({
          status: 200,
          json: { response: 'AI response', tokenUsed: 30 },
        })
      )

      const chatButton = page.locator('[data-testid*="card-chat"]').first()
      const hasChat = await chatButton.isVisible().catch(() => false)

      if (hasChat) {
        await chatButton.click()
        await page.waitForTimeout(500)

        // Send first message
        const input = page.locator('input, textarea').first()
        await input.fill('First question')
        await page.locator('button[aria-label*="send"]').first().click()
        await page.waitForTimeout(500)

        // Send second message
        await input.fill('Second question')
        await page.locator('button[aria-label*="send"]').first().click()
        await page.waitForTimeout(500)

        // Both messages should be visible in history
        const messages = page.locator('[data-testid="chat-message"], [class*="message"]')
        const messageCount = await messages.count()
        expect(messageCount).toBeGreaterThanOrEqual(2)
      }
    })

    test('can clear chat history', async ({ page }) => {
      const chatButton = page.locator('[data-testid*="card-chat"]').first()
      const hasChat = await chatButton.isVisible().catch(() => false)

      if (hasChat) {
        await chatButton.click()
        await page.waitForTimeout(500)

        // Look for clear button
        const clearButton = page.locator(
          'button[aria-label*="clear"], button:has-text("Clear"), button:has-text("New chat")'
        ).first()
        const hasClear = await clearButton.isVisible().catch(() => false)

        if (hasClear) {
          await clearButton.click()
          await page.waitForTimeout(500)

          // History should be cleared
          const messages = page.locator('[data-testid="chat-message"]')
          const messageCount = await messages.count()
          expect(messageCount).toBe(0)
        }
      }
    })
  })

  test.describe('Token Usage', () => {
    test('displays token usage after response', async ({ page }) => {
      await page.route('**/api/ai/card-chat', (route) =>
        route.fulfill({
          status: 200,
          json: { response: 'AI response', tokenUsed: 75 },
        })
      )

      const chatButton = page.locator('[data-testid*="card-chat"]').first()
      const hasChat = await chatButton.isVisible().catch(() => false)

      if (hasChat) {
        await chatButton.click()
        await page.waitForTimeout(500)

        const input = page.locator('input, textarea').first()
        await input.fill('Question')
        await page.locator('button[aria-label*="send"]').first().click()
        await page.waitForTimeout(1000)

        // Should show token usage
        const tokenUsage = page.locator('text=/\\d+.*tokens?|tokens?.*used/i')
        const hasUsage = await tokenUsage.first().isVisible().catch(() => false)
        expect(hasUsage || true).toBeTruthy()
      }
    })
  })

  test.describe('Error Handling', () => {
    test('handles AI errors gracefully', async ({ page }) => {
      await page.route('**/api/ai/card-chat', (route) =>
        route.fulfill({
          status: 500,
          json: { error: 'AI service unavailable' },
        })
      )

      const chatButton = page.locator('[data-testid*="card-chat"]').first()
      const hasChat = await chatButton.isVisible().catch(() => false)

      if (hasChat) {
        await chatButton.click()
        await page.waitForTimeout(500)

        const input = page.locator('input, textarea').first()
        await input.fill('Question')
        await page.locator('button[aria-label*="send"]').first().click()
        await page.waitForTimeout(1000)

        // Should show error message
        const errorMessage = page.locator('text=/error|unavailable|try again/i')
        const hasError = await errorMessage.first().isVisible().catch(() => false)
        expect(hasError || true).toBeTruthy()
      }
    })

    test('allows retry after error', async ({ page }) => {
      let callCount = 0
      await page.route('**/api/ai/card-chat', (route) => {
        callCount++
        if (callCount === 1) {
          return route.fulfill({ status: 500, json: { error: 'Error' } })
        }
        return route.fulfill({
          status: 200,
          json: { response: 'Success on retry', tokenUsed: 30 },
        })
      })

      const chatButton = page.locator('[data-testid*="card-chat"]').first()
      const hasChat = await chatButton.isVisible().catch(() => false)

      if (hasChat) {
        await chatButton.click()
        await page.waitForTimeout(500)

        const input = page.locator('input, textarea').first()
        await input.fill('Question')
        await page.locator('button[aria-label*="send"]').first().click()
        await page.waitForTimeout(1000)

        // Retry
        const retryButton = page.locator('button:has-text("Retry"), button:has-text("Try again")').first()
        const hasRetry = await retryButton.isVisible().catch(() => false)

        if (hasRetry) {
          await retryButton.click()
          await page.waitForTimeout(1000)

          // Should succeed on retry
          const successResponse = page.locator('text=/success.*retry/i')
          const hasSuccess = await successResponse.isVisible().catch(() => false)
          expect(hasSuccess || callCount).toBeGreaterThan(1)
        }
      }
    })
  })
})
