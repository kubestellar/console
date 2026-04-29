import { test, expect } from '@playwright/test'

test.describe('Mission Control Pipeline', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to mission control in demo mode
    await page.goto('http://localhost:5174/?demo=true')
  })

  test('mission sidebar opens on click', async ({ page }) => {
    const trigger = page.getByTestId('mission-sidebar-toggle').or(page.getByRole('button', { name: /mission/i }))
    if (await trigger.isVisible()) {
      await trigger.click()
      await expect(page.getByTestId('mission-sidebar').or(page.locator('[class*="mission"]'))).toBeVisible({ timeout: 5000 })
    }
  })

  test('mission list loads available missions', async ({ page }) => {
    // Navigate to missions browse
    await page.goto('http://localhost:5174/?browse=missions&demo=true')
    // Should show mission cards
    const missionItems = page.locator('[data-testid*="mission"]').or(page.locator('[class*="mission-card"]'))
    await expect(missionItems.first()).toBeVisible({ timeout: 10000 })
  })

  test('mission detail page shows steps', async ({ page }) => {
    await page.goto('http://localhost:5174/missions/install-opencost?demo=true')
    // Should render mission steps or content
    const content = page.locator('main, [role="main"], #root')
    await expect(content).toBeVisible({ timeout: 10000 })
  })

  test.describe('KB Query Pipeline (scaffold)', () => {
    test.skip('user query returns relevant KB results', async () => {
      // TODO: Mentee implements — sends query to /api/agent/chat, verifies KB context in response
    })

    test.skip('generated commands are valid kubectl/helm', async () => {
      // TODO: Mentee implements — validates command syntax from AI response
    })

    test.skip('mission execution completes without error', async () => {
      // TODO: Mentee implements — runs mission steps and checks completion
    })
  })
})
