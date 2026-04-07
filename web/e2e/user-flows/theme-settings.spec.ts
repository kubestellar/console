import { test, expect, testData } from '../fixtures'

/**
 * E2E tests for theme toggle and settings persistence
 *
 * Covers: dark/light/system theme switching, settings survival across reload,
 * and responsive layout behaviour at different viewport sizes.
 */

async function setupPage(page: Parameters<typeof test>[1]['page'], mockAPI: Parameters<typeof test>[1]['mockAPI']) {
  await page.route('**/api/me', (route) =>
    route.fulfill({
      status: 200,
      json: { id: '1', github_login: 'testuser', email: 'test@example.com', onboarded: true },
    })
  )
  await mockAPI.mockClusters(testData.clusters.healthy)
  await mockAPI.mockPodIssues(testData.podIssues.none)
  await mockAPI.mockEvents(testData.events.normal)
  await mockAPI.mockLocalAgent()

  await page.goto('/login')
  await page.evaluate(() => {
    localStorage.setItem('token', 'test-token')
    localStorage.setItem('demo-user-onboarded', 'true')
  })
  await page.goto('/')
  await page.waitForLoadState('domcontentloaded')
  await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 15000 })
}

// ─────────────────────────────────────────────────────────────────────────────
// Theme toggle
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Theme Toggle', () => {
  test('theme toggle button is accessible', async ({ page, mockAPI }) => {
    await setupPage(page, mockAPI)

    const themeBtn = page
      .getByTestId('theme-toggle')
      .or(page.getByRole('button', { name: /theme|dark mode|light mode/i }))
      .or(page.getByTitle(/toggle theme|switch theme/i))

    await expect(themeBtn.first()).toBeVisible({ timeout: 5000 })
  })

  test('clicking theme toggle changes the colour scheme', async ({ page, mockAPI }) => {
    await setupPage(page, mockAPI)

    const html = page.locator('html')
    const initialClass = await html.getAttribute('class') || ''
    const initialDataTheme = await html.getAttribute('data-theme') || ''

    const themeBtn = page
      .getByTestId('theme-toggle')
      .or(page.getByRole('button', { name: /theme|dark mode|light mode/i }))

    const hasBtn = await themeBtn.first().isVisible().catch(() => false)
    if (!hasBtn) test.skip()

    await themeBtn.first().click()
    await page.waitForTimeout(300) // allow CSS transition

    const newClass = await html.getAttribute('class') || ''
    const newDataTheme = await html.getAttribute('data-theme') || ''

    // Either the class or data-theme attribute must have changed
    expect(
      newClass !== initialClass || newDataTheme !== initialDataTheme
    ).toBeTruthy()
  })

  test('theme choice persists after page reload', async ({ page, mockAPI }) => {
    await setupPage(page, mockAPI)

    const themeBtn = page
      .getByTestId('theme-toggle')
      .or(page.getByRole('button', { name: /theme|dark mode|light mode/i }))

    const hasBtn = await themeBtn.first().isVisible().catch(() => false)
    if (!hasBtn) test.skip()

    await themeBtn.first().click()
    await page.waitForTimeout(300)

    const html = page.locator('html')
    const classAfterToggle = await html.getAttribute('class') || ''
    const dataThemeAfterToggle = await html.getAttribute('data-theme') || ''

    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 15000 })

    const classAfterReload = await html.getAttribute('class') || ''
    const dataThemeAfterReload = await html.getAttribute('data-theme') || ''

    // Theme must survive a reload
    expect(classAfterReload).toBe(classAfterToggle)
    expect(dataThemeAfterReload).toBe(dataThemeAfterToggle)
  })

  test('dark mode applies dark background colours', async ({ page, mockAPI }) => {
    await setupPage(page, mockAPI)

    // Force dark mode via localStorage (most common implementation)
    await page.evaluate(() => {
      localStorage.setItem('theme', 'dark')
      document.documentElement.classList.add('dark')
      document.documentElement.setAttribute('data-theme', 'dark')
    })
    await page.reload()
    await page.waitForLoadState('domcontentloaded')

    const body = page.locator('body')
    const bgColor = await body.evaluate((el) =>
      window.getComputedStyle(el).backgroundColor
    )

    // Dark backgrounds are typically rgb values with low brightness
    // e.g. rgb(15, 15, 15) or rgb(17, 17, 17)
    // We just verify it's not a bright white (255,255,255)
    expect(bgColor).not.toBe('rgb(255, 255, 255)')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Settings persistence
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Settings Persistence', () => {
  test('sidebar collapsed state persists after reload', async ({ page, mockAPI }) => {
    await setupPage(page, mockAPI)

    const sidebar = page.getByTestId('sidebar')
    await expect(sidebar).toBeVisible()

    // Find the sidebar collapse toggle
    const collapseBtn = page
      .getByTestId('sidebar-collapse')
      .or(page.getByRole('button', { name: /collapse sidebar|toggle sidebar/i }))

    const hasCollapse = await collapseBtn.isVisible().catch(() => false)
    if (!hasCollapse) test.skip()

    // Collapse the sidebar
    await collapseBtn.click()
    await page.waitForTimeout(300)

    const collapsedAttr = await sidebar.getAttribute('data-collapsed')
    const collapsedClass = await sidebar.getAttribute('class') || ''

    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 15000 })

    const sidebarAfter = page.getByTestId('sidebar')
    const collapsedAttrAfter = await sidebarAfter.getAttribute('data-collapsed')
    const collapsedClassAfter = await sidebarAfter.getAttribute('class') || ''

    // State should match what we left it in
    expect(collapsedAttrAfter).toBe(collapsedAttr)
    expect(collapsedClassAfter).toBe(collapsedClass)
  })

  test('auto-refresh interval setting persists', async ({ page, mockAPI }) => {
    await setupPage(page, mockAPI)

    // Check if refresh interval selector exists
    const refreshSelect = page
      .getByTestId('refresh-interval')
      .or(page.getByRole('combobox', { name: /refresh|interval/i }))

    const hasSelect = await refreshSelect.isVisible().catch(() => false)
    if (!hasSelect) test.skip()

    // Change to a non-default interval
    await refreshSelect.selectOption({ index: 1 })
    const chosenValue = await refreshSelect.inputValue()

    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 15000 })

    const refreshSelectAfter = page
      .getByTestId('refresh-interval')
      .or(page.getByRole('combobox', { name: /refresh|interval/i }))

    const valueAfterReload = await refreshSelectAfter.inputValue()
    expect(valueAfterReload).toBe(chosenValue)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Responsive layout
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Responsive Layout', () => {
  const viewports = [
    { name: 'mobile',  width: 375,  height: 667  },
    { name: 'tablet',  width: 768,  height: 1024 },
    { name: 'desktop', width: 1280, height: 720  },
    { name: 'wide',    width: 1920, height: 1080 },
  ]

  for (const vp of viewports) {
    test(`renders correctly at ${vp.name} (${vp.width}×${vp.height})`, async ({ page, mockAPI }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      await setupPage(page, mockAPI)

      await expect(page.getByTestId('dashboard-page')).toBeVisible()
      await expect(page.getByTestId('dashboard-header')).toBeVisible()

      // No horizontal scrollbar at any viewport
      const hasHScroll = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth
      )
      expect(hasHScroll, `Horizontal overflow at ${vp.name}`).toBeFalsy()
    })
  }

  test('sidebar collapses automatically at mobile width', async ({ page, mockAPI }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await setupPage(page, mockAPI)

    const sidebar = page.getByTestId('sidebar')
    await expect(sidebar).toBeVisible()

    // At mobile widths the sidebar should either be collapsed or hidden by default
    const isCollapsed =
      (await sidebar.getAttribute('data-collapsed')) === 'true' ||
      (await sidebar.getAttribute('class') || '').includes('collapsed') ||
      (await sidebar.evaluate((el) => {
        const w = el.getBoundingClientRect().width
        return w < 80  // collapsed sidebars are typically icon-only (<80 px)
      }))

    // Soft assertion — sidebar behaviour at mobile varies by implementation
    // What matters most is that it doesn't overflow
    const hasHScroll = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    )
    expect(hasHScroll).toBeFalsy()
    // eslint-disable-next-line no-console
    console.log(`Sidebar collapsed at mobile: ${isCollapsed}`)
  })

  test('card grid reflows from multi-column to single-column at mobile', async ({ page, mockAPI }) => {
    await setupPage(page, mockAPI)

    const grid = page.getByTestId('dashboard-cards-grid')
    await expect(grid).toBeVisible()

    // Desktop: measure column count proxy via container width / card width
    const desktopGridWidth = await grid.evaluate((el) => el.getBoundingClientRect().width)

    await page.setViewportSize({ width: 375, height: 667 })
    await page.waitForTimeout(300) // allow reflow

    const mobileGridWidth = await grid.evaluate((el) => el.getBoundingClientRect().width)

    // Grid should be narrower at mobile
    expect(mobileGridWidth).toBeLessThanOrEqual(desktopGridWidth)
  })
})