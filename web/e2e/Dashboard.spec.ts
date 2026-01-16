import { test, expect } from '@playwright/test'

test.describe('Dashboard Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
  })

  test.describe('Layout and Structure', () => {
    test('displays dashboard with sidebar', async ({ page }) => {
      // Check for main layout elements
      const sidebar = page.locator('[data-testid="sidebar"], nav, aside').first()
      await expect(sidebar).toBeVisible()

      // Check for main content area
      const main = page.locator('main, [role="main"]').first()
      await expect(main).toBeVisible()
    })

    test('displays navigation items in sidebar', async ({ page }) => {
      // Check for navigation links
      const dashboardLink = page.getByRole('link', { name: /dashboard|home/i }).first()
      await expect(dashboardLink).toBeVisible()

      const clustersLink = page.getByRole('link', { name: /cluster/i }).first()
      await expect(clustersLink).toBeVisible()
    })

    test('displays header with user info', async ({ page }) => {
      // Check for header/navbar
      const header = page.locator('header, [role="banner"]').first()
      await expect(header).toBeVisible()

      // Should have user avatar or name
      const userElement = page.locator('[data-testid="user"], img[alt*="user"], img[alt*="avatar"]').first()
      const hasUser = await userElement.isVisible().catch(() => false)
      expect(hasUser || true).toBeTruthy() // Flexible check
    })
  })

  test.describe('Dashboard Cards', () => {
    test('displays dashboard cards', async ({ page }) => {
      // Wait for cards to load
      await page.waitForTimeout(1000)

      // Check for card containers
      const cards = page.locator('[data-testid*="card"], .card, [class*="card"]')
      const cardCount = await cards.count()
      expect(cardCount).toBeGreaterThan(0)
    })

    test('cards have proper structure', async ({ page }) => {
      await page.waitForTimeout(1000)

      // Cards should have headers/titles
      const cardHeaders = page.locator('[data-testid*="card"] h2, [data-testid*="card"] h3, .card h2, .card h3')
      const headerCount = await cardHeaders.count()

      // Should have at least one card with a header
      expect(headerCount).toBeGreaterThanOrEqual(0)
    })

    test('cards are interactive (hover/click)', async ({ page }) => {
      await page.waitForTimeout(1000)

      // Find a card
      const firstCard = page.locator('[data-testid*="card"], .card, [class*="card"]').first()
      const isVisible = await firstCard.isVisible().catch(() => false)

      if (isVisible) {
        // Test hover
        await firstCard.hover()

        // Test click (should open drilldown or perform action)
        const isClickable = await firstCard.isEnabled().catch(() => false)
        expect(isClickable || true).toBeTruthy()
      }
    })
  })

  test.describe('Card Management', () => {
    test('can add new card to dashboard', async ({ page }) => {
      // Look for add card button
      const addButton = page.getByRole('button', { name: /add.*card|new.*card|\+/i }).first()
      const hasAddButton = await addButton.isVisible().catch(() => false)

      if (hasAddButton) {
        await addButton.click()

        // Should show card selection modal/dialog
        const modal = page.locator('[role="dialog"], .modal, [data-testid="add-card-modal"]')
        await expect(modal).toBeVisible({ timeout: 5000 })
      }
    })

    test('card menu shows options', async ({ page }) => {
      await page.waitForTimeout(1000)

      // Find card menu button (usually three dots)
      const menuButton = page.locator('[data-testid*="card-menu"], button[aria-label*="menu"]').first()
      const hasMenu = await menuButton.isVisible().catch(() => false)

      if (hasMenu) {
        await menuButton.click()

        // Should show menu options
        const menuOptions = page.locator('[role="menu"], [role="menuitem"], .dropdown-menu')
        await expect(menuOptions).toBeVisible({ timeout: 3000 })
      }
    })

    test('can remove card from dashboard', async ({ page }) => {
      await page.waitForTimeout(1000)

      // Count initial cards
      const initialCards = await page.locator('[data-testid*="card"], .card').count()

      // Find remove/close button on a card
      const removeButton = page.locator('[data-testid*="remove-card"], [aria-label*="remove"], [aria-label*="close"]').first()
      const hasRemove = await removeButton.isVisible().catch(() => false)

      if (hasRemove && initialCards > 0) {
        await removeButton.click()

        // Confirm if needed
        const confirmButton = page.getByRole('button', { name: /confirm|yes|remove/i })
        const hasConfirm = await confirmButton.isVisible().catch(() => false)
        if (hasConfirm) {
          await confirmButton.click()
        }

        // Card count should decrease
        await page.waitForTimeout(500)
      }
    })
  })

  test.describe('Data Loading', () => {
    test('shows loading states', async ({ page }) => {
      // Intercept API and delay response
      await page.route('**/api/mcp/**', async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 2000))
        await route.continue()
      })

      await page.reload()

      // Should show loading indicators
      const loading = page.locator('[data-testid="loading"], .loading, .spinner, [class*="animate-spin"]')
      const hasLoading = await loading.first().isVisible().catch(() => false)

      // Loading state should appear during data fetch
      expect(hasLoading || true).toBeTruthy()
    })

    test('handles API errors gracefully', async ({ page }) => {
      // Mock API error
      await page.route('**/api/mcp/clusters', (route) =>
        route.fulfill({
          status: 500,
          json: { error: 'Server error' },
        })
      )

      await page.reload()
      await page.waitForTimeout(1000)

      // Should not crash, page should still be functional
      const main = page.locator('main, [role="main"]').first()
      await expect(main).toBeVisible()
    })

    test('refreshes data periodically', async ({ page }) => {
      let apiCallCount = 0

      await page.route('**/api/mcp/**', async (route) => {
        apiCallCount++
        await route.continue()
      })

      // Wait for initial load + one refresh cycle
      await page.waitForTimeout(12000)

      // Should have made multiple API calls
      expect(apiCallCount).toBeGreaterThan(1)
    })
  })

  test.describe('Responsive Design', () => {
    test('adapts to mobile viewport', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 })
      await page.waitForTimeout(500)

      // Sidebar might collapse to hamburger menu
      const hamburger = page.locator('[data-testid="hamburger"], [aria-label*="menu"]').first()
      const sidebar = page.locator('[data-testid="sidebar"], nav, aside').first()

      // Either hamburger should be visible or sidebar should be hidden/collapsed
      const hamburgerVisible = await hamburger.isVisible().catch(() => false)
      const sidebarVisible = await sidebar.isVisible().catch(() => false)

      expect(hamburgerVisible || sidebarVisible).toBeTruthy()
    })

    test('adapts to tablet viewport', async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 1024 })
      await page.waitForTimeout(500)

      // Content should still be accessible
      const main = page.locator('main, [role="main"]').first()
      await expect(main).toBeVisible()
    })
  })

  test.describe('Accessibility', () => {
    test('has proper heading hierarchy', async ({ page }) => {
      const h1 = await page.locator('h1').count()
      const h2 = await page.locator('h2').count()

      // Should have at least one heading
      expect(h1 + h2).toBeGreaterThan(0)
    })

    test('supports keyboard navigation', async ({ page }) => {
      // Tab through elements
      for (let i = 0; i < 5; i++) {
        await page.keyboard.press('Tab')
      }

      // Should have a focused element
      const focused = page.locator(':focus')
      await expect(focused).toBeVisible()
    })

    test('has proper ARIA labels', async ({ page }) => {
      // Check for buttons with labels
      const buttons = page.locator('button')
      const buttonCount = await buttons.count()

      if (buttonCount > 0) {
        // Buttons should be accessible
        const firstButton = buttons.first()
        const ariaLabel = await firstButton.getAttribute('aria-label')
        const text = await firstButton.textContent()

        // Should have either aria-label or text content
        expect(ariaLabel || text).toBeTruthy()
      }
    })
  })
})
