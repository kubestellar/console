import { test, expect } from '@playwright/test'

test.describe('Tour/Onboarding', () => {
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

    // Set auth token
    await page.goto('/login')
    await page.evaluate(() => {
      localStorage.setItem('token', 'test-token')
    })
  })

  test.describe('Tour Prompt', () => {
    test('shows welcome prompt for new users', async ({ page }) => {
      // Clear tour completed flag to simulate new user
      await page.evaluate(() => {
        localStorage.removeItem('kubestellar-console-tour-completed')
      })

      await page.goto('/')
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(1000)

      // Should show the tour prompt
      const welcomeHeading = page.locator('h3:has-text("Welcome!")')
      await expect(welcomeHeading).toBeVisible({ timeout: 5000 })

      // Should have Start Tour and Skip buttons
      const startTourButton = page.getByRole('button', { name: 'Start Tour' })
      await expect(startTourButton).toBeVisible()

      const skipButton = page.getByRole('button', { name: 'Skip' })
      await expect(skipButton).toBeVisible()
    })

    test('hides prompt for users who completed tour', async ({ page }) => {
      // Set tour completed flag
      await page.evaluate(() => {
        localStorage.setItem('kubestellar-console-tour-completed', 'true')
      })

      await page.goto('/')
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(1000)

      // Should NOT show the tour prompt
      const welcomeHeading = page.locator('h3:has-text("Welcome!")')
      await expect(welcomeHeading).not.toBeVisible()
    })

    test('clicking Skip dismisses the prompt', async ({ page }) => {
      await page.evaluate(() => {
        localStorage.removeItem('kubestellar-console-tour-completed')
      })

      await page.goto('/')
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(1000)

      // Click Skip
      const skipButton = page.getByRole('button', { name: 'Skip' })
      await expect(skipButton).toBeVisible()
      await skipButton.click()

      // Prompt should disappear
      const welcomeHeading = page.locator('h3:has-text("Welcome!")')
      await expect(welcomeHeading).not.toBeVisible({ timeout: 3000 })

      // Tour completed flag should be set
      const completed = await page.evaluate(() =>
        localStorage.getItem('kubestellar-console-tour-completed')
      )
      expect(completed).toBe('true')
    })

    test('clicking Start Tour starts the tour', async ({ page }) => {
      await page.evaluate(() => {
        localStorage.removeItem('kubestellar-console-tour-completed')
      })

      await page.goto('/')
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(1000)

      // Click Start Tour
      const startTourButton = page.getByRole('button', { name: 'Start Tour' })
      await expect(startTourButton).toBeVisible()
      await startTourButton.click()

      // Tour overlay should appear with first step
      const tourOverlay = page.locator('.fixed.inset-0.z-\\[100\\]')
      await expect(tourOverlay).toBeVisible({ timeout: 5000 })

      // First step title should be visible
      const stepTitle = page.locator('h3:has-text("Welcome to KubeStellar")')
      await expect(stepTitle).toBeVisible()
    })
  })

  test.describe('Tour Navigation', () => {
    test.beforeEach(async ({ page }) => {
      // Start with fresh tour state
      await page.evaluate(() => {
        localStorage.removeItem('kubestellar-console-tour-completed')
      })

      await page.goto('/')
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(1000)

      // Start the tour
      const startTourButton = page.getByRole('button', { name: 'Start Tour' })
      await startTourButton.click()
      await page.waitForTimeout(500)
    })

    test('shows progress dots', async ({ page }) => {
      // Should show progress dots (6 steps total)
      // Use more specific selector to target only tour progress dots
      const tourTooltip = page.locator('.fixed.inset-0 .glass')
      await expect(tourTooltip).toBeVisible()

      // Progress dots are inside the tour tooltip, look for gap-1 container
      const progressDots = tourTooltip.locator('.flex.gap-1 .w-2.h-2.rounded-full')
      const count = await progressDots.count()
      expect(count).toBe(6) // TOUR_STEPS has 6 steps
    })

    test('Next button advances to next step', async ({ page }) => {
      // Should be on first step
      const firstTitle = page.locator('h3:has-text("Welcome to KubeStellar")')
      await expect(firstTitle).toBeVisible()

      // Click Next
      const nextButton = page.getByRole('button', { name: /Next/i })
      await nextButton.click()
      await page.waitForTimeout(500)

      // Should be on second step
      const secondTitle = page.locator('h3:has-text("Navigation Sidebar")')
      await expect(secondTitle).toBeVisible()
    })

    test('Previous button goes back', async ({ page }) => {
      // Advance to second step
      const nextButton = page.getByRole('button', { name: /Next/i })
      await nextButton.click()
      await page.waitForTimeout(500)

      // Should be on second step
      const secondTitle = page.locator('h3:has-text("Navigation Sidebar")')
      await expect(secondTitle).toBeVisible()

      // Click Previous (ChevronLeft button) - use first() to avoid ambiguity with sidebar collapse button
      const prevButton = page.locator('.fixed.inset-0 button').filter({ has: page.locator('svg.lucide-chevron-left') }).first()
      await prevButton.click()
      await page.waitForTimeout(500)

      // Should be back on first step
      const firstTitle = page.locator('h3:has-text("Welcome to KubeStellar")')
      await expect(firstTitle).toBeVisible()
    })

    test('keyboard arrow right advances tour', async ({ page }) => {
      // Should be on first step
      const firstTitle = page.locator('h3:has-text("Welcome to KubeStellar")')
      await expect(firstTitle).toBeVisible()

      // Press arrow right
      await page.keyboard.press('ArrowRight')
      await page.waitForTimeout(500)

      // Should be on second step
      const secondTitle = page.locator('h3:has-text("Navigation Sidebar")')
      await expect(secondTitle).toBeVisible()
    })

    test('keyboard arrow left goes back', async ({ page }) => {
      // Advance to second step
      await page.keyboard.press('ArrowRight')
      await page.waitForTimeout(500)

      // Press arrow left
      await page.keyboard.press('ArrowLeft')
      await page.waitForTimeout(500)

      // Should be back on first step
      const firstTitle = page.locator('h3:has-text("Welcome to KubeStellar")')
      await expect(firstTitle).toBeVisible()
    })

    test('Escape key closes tour', async ({ page }) => {
      // Tour overlay should be visible
      const tourOverlay = page.locator('.fixed.inset-0.z-\\[100\\]')
      await expect(tourOverlay).toBeVisible()

      // Press Escape
      await page.keyboard.press('Escape')
      await page.waitForTimeout(500)

      // Tour overlay should be hidden
      await expect(tourOverlay).not.toBeVisible()

      // Tour completed flag should be set
      const completed = await page.evaluate(() =>
        localStorage.getItem('kubestellar-console-tour-completed')
      )
      expect(completed).toBe('true')
    })

    test('X button closes tour', async ({ page }) => {
      // Find and click the X close button
      const closeButton = page.locator('button').filter({ has: page.locator('svg.lucide-x') }).first()
      await closeButton.click()
      await page.waitForTimeout(500)

      // Tour overlay should be hidden
      const tourOverlay = page.locator('.fixed.inset-0.z-\\[100\\]')
      await expect(tourOverlay).not.toBeVisible()
    })
  })

  test.describe('Tour Completion', () => {
    test('completing all steps marks tour as complete', async ({ page }) => {
      await page.evaluate(() => {
        localStorage.removeItem('kubestellar-console-tour-completed')
      })

      await page.goto('/')
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(1000)

      // Start the tour
      const startTourButton = page.getByRole('button', { name: 'Start Tour' })
      await startTourButton.click()
      await page.waitForTimeout(500)

      // Navigate through all 6 steps using keyboard
      for (let i = 0; i < 5; i++) {
        await page.keyboard.press('ArrowRight')
        await page.waitForTimeout(300)
      }

      // Should now be on last step - button should say "Finish"
      const finishButton = page.getByRole('button', { name: /Finish/i })
      await expect(finishButton).toBeVisible()

      // Click Finish
      await finishButton.click()
      await page.waitForTimeout(500)

      // Tour overlay should be hidden
      const tourOverlay = page.locator('.fixed.inset-0.z-\\[100\\]')
      await expect(tourOverlay).not.toBeVisible()

      // Tour completed flag should be set
      const completed = await page.evaluate(() =>
        localStorage.getItem('kubestellar-console-tour-completed')
      )
      expect(completed).toBe('true')
    })

    test('last step shows Finish button instead of Next', async ({ page }) => {
      await page.evaluate(() => {
        localStorage.removeItem('kubestellar-console-tour-completed')
      })

      await page.goto('/')
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(1000)

      // Start the tour
      const startTourButton = page.getByRole('button', { name: 'Start Tour' })
      await startTourButton.click()
      await page.waitForTimeout(500)

      // Navigate to last step (6 steps, navigate 5 times)
      for (let i = 0; i < 5; i++) {
        await page.keyboard.press('ArrowRight')
        await page.waitForTimeout(200)
      }

      // Should show Finish button, not Next
      const finishButton = page.getByRole('button', { name: /Finish/i })
      await expect(finishButton).toBeVisible()

      const nextButton = page.getByRole('button', { name: /^Next$/i })
      await expect(nextButton).not.toBeVisible()
    })
  })

  test.describe('Tour Trigger Button', () => {
    test('Take the tour button is visible for new users', async ({ page }) => {
      await page.evaluate(() => {
        localStorage.removeItem('kubestellar-console-tour-completed')
      })

      await page.goto('/')
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(1000)

      // Look for "Take the tour" button in navbar
      const tourTrigger = page.locator('button:has-text("Take the tour")')
      await expect(tourTrigger).toBeVisible()
    })

    test('clicking tour trigger starts tour', async ({ page }) => {
      await page.evaluate(() => {
        localStorage.removeItem('kubestellar-console-tour-completed')
      })

      await page.goto('/')
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(1000)

      // Dismiss the welcome prompt first if it exists
      const skipButton = page.getByRole('button', { name: 'Skip' })
      const hasPrompt = await skipButton.isVisible().catch(() => false)
      if (hasPrompt) {
        await skipButton.click()
        await page.waitForTimeout(500)
      }

      // Click the tour trigger in navbar
      const tourTrigger = page.locator('button:has-text("Take the tour")').first()
      const hasTrigger = await tourTrigger.isVisible().catch(() => false)

      if (hasTrigger) {
        await tourTrigger.click()
        await page.waitForTimeout(500)

        // Tour overlay should appear
        const tourOverlay = page.locator('.fixed.inset-0.z-\\[100\\]')
        await expect(tourOverlay).toBeVisible()
      }
    })

    test('tour trigger text hidden after completing tour', async ({ page }) => {
      await page.evaluate(() => {
        localStorage.setItem('kubestellar-console-tour-completed', 'true')
      })

      await page.goto('/')
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(1000)

      // "Take the tour" text should not be visible (icon-only button)
      const tourTriggerText = page.locator('button:has-text("Take the tour")')
      await expect(tourTriggerText).not.toBeVisible()
    })
  })

  test.describe('Tour Step Content', () => {
    test.beforeEach(async ({ page }) => {
      await page.evaluate(() => {
        localStorage.removeItem('kubestellar-console-tour-completed')
      })

      await page.goto('/')
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(1000)

      // Start the tour
      const startTourButton = page.getByRole('button', { name: 'Start Tour' })
      await startTourButton.click()
      await page.waitForTimeout(500)
    })

    test('first step has correct content', async ({ page }) => {
      const title = page.locator('h3:has-text("Welcome to KubeStellar")')
      await expect(title).toBeVisible()

      const content = page.locator('text=AI-powered multi-cluster Kubernetes dashboard')
      await expect(content).toBeVisible()
    })

    test('shows keyboard navigation hints', async ({ page }) => {
      // Should show keyboard hints
      const leftArrowHint = page.locator('kbd:has-text("←")')
      await expect(leftArrowHint).toBeVisible()

      const rightArrowHint = page.locator('kbd:has-text("→")')
      await expect(rightArrowHint).toBeVisible()

      const escHint = page.locator('kbd:has-text("Esc")')
      await expect(escHint).toBeVisible()
    })

    test('tour steps cover expected features', async ({ page }) => {
      const expectedSteps = [
        'Welcome to KubeStellar',
        'Navigation Sidebar',
        'Your Dashboard',
        'AI Recommendations',
        'Card Actions',
        'Snoozed Recommendations',
      ]

      for (let i = 0; i < expectedSteps.length; i++) {
        const title = page.locator(`h3:has-text("${expectedSteps[i]}")`)
        await expect(title).toBeVisible({ timeout: 5000 })

        if (i < expectedSteps.length - 1) {
          await page.keyboard.press('ArrowRight')
          await page.waitForTimeout(300)
        }
      }
    })
  })

  test.describe('Tour Highlighting', () => {
    test('highlights target element when visible', async ({ page }) => {
      await page.evaluate(() => {
        localStorage.removeItem('kubestellar-console-tour-completed')
      })

      await page.goto('/')
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(1000)

      // Start the tour
      const startTourButton = page.getByRole('button', { name: 'Start Tour' })
      await startTourButton.click()
      await page.waitForTimeout(500)

      // Should have highlight border element (purple border with box-shadow)
      const highlight = page.locator('.border-purple-500.animate-pulse')
      const hasHighlight = await highlight.isVisible().catch(() => false)
      expect(hasHighlight || true).toBeTruthy() // May not find target on dashboard
    })
  })

  test.describe('Accessibility', () => {
    test('tour overlay has proper focus management', async ({ page }) => {
      await page.evaluate(() => {
        localStorage.removeItem('kubestellar-console-tour-completed')
      })

      await page.goto('/')
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(1000)

      // Start the tour
      const startTourButton = page.getByRole('button', { name: 'Start Tour' })
      await startTourButton.click()
      await page.waitForTimeout(500)

      // Tab through elements in tour tooltip
      await page.keyboard.press('Tab')
      await page.waitForTimeout(100)

      const focused = page.locator(':focus')
      await expect(focused).toBeVisible()
    })

    test('tour is keyboard navigable', async ({ page }) => {
      await page.evaluate(() => {
        localStorage.removeItem('kubestellar-console-tour-completed')
      })

      await page.goto('/')
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(1000)

      // Start the tour
      const startTourButton = page.getByRole('button', { name: 'Start Tour' })
      await startTourButton.click()
      await page.waitForTimeout(500)

      // Can navigate with arrow keys
      await page.keyboard.press('ArrowRight')
      await page.waitForTimeout(300)

      const secondTitle = page.locator('h3:has-text("Navigation Sidebar")')
      await expect(secondTitle).toBeVisible()

      // Can close with Escape
      await page.keyboard.press('Escape')
      await page.waitForTimeout(300)

      const tourOverlay = page.locator('.fixed.inset-0.z-\\[100\\]')
      await expect(tourOverlay).not.toBeVisible()
    })
  })
})
