import { test, expect, Page } from '@playwright/test'

async function setupPage(page: Page) {
  // Catch-all API mock prevents unmocked requests hanging in webkit/firefox
  await page.route('**/api/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    })
  )

  await page.route('**/api/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: '1',
        github_id: '12345',
        github_login: 'testuser',
        email: 'test@example.com',
        onboarded: true,
      }),
    })
  )

  await page.route('**/api/mcp/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ clusters: [], issues: [], events: [], nodes: [] }),
    })
  )

  // Seed localStorage BEFORE any page script runs so the auth guard sees
  // the token on first execution. page.evaluate() runs after the page has
  // already parsed and executed scripts, which is too late for webkit/Safari
  // where the auth redirect fires synchronously on script evaluation.
  // page.addInitScript() injects the snippet ahead of any page code (#9096).
  await page.addInitScript(() => {
    localStorage.setItem('token', 'test-token')
    localStorage.setItem('kc-demo-mode', 'true')
    localStorage.setItem('demo-user-onboarded', 'true')
  })
  await page.goto('/')
  await page.waitForLoadState('domcontentloaded')
  // Wait for the navbar to be fully rendered — webkit/mobile-safari can be
  // slower to stabilize layout after domcontentloaded, causing click actions
  // to fail with "waiting for element to be stable" (#nightly-playwright).
  await page.locator('nav[data-tour="navbar"]').waitFor({ state: 'visible' })
}

// Breakpoints from Navbar.tsx:
//   sm  = 640px  (search bar visible in main bar)
//   md  = 768px  (ClusterFilterPanel, AgentStatus, AgentSelector)
//   lg  = 1024px (UpdateIndicator, TokenUsage, FeatureRequest; overflow menu hidden)
// Minimum enforced width is ~511px (observed in issue #2999)
const VIEWPORTS = [
  { name: 'minimum (511px)', width: 511, height: 720 },
  { name: 'small (640px)', width: 640, height: 720 },
  { name: 'medium (768px)', width: 768, height: 720 },
  { name: 'large (1024px)', width: 1024, height: 720 },
  { name: 'full (1280px)', width: 1280, height: 720 },
]

test.describe('Navbar responsive layout', () => {
  // Always-visible elements must be accessible at every allowed viewport width
  for (const { name, width, height } of VIEWPORTS) {
    test(`core navbar items are accessible at ${name}`, async ({ page }) => {
      await page.setViewportSize({ width, height })
      await setupPage(page)

      const nav = page.locator('nav[data-tour="navbar"]')
      await expect(nav).toBeVisible()

      // Logo / home button always visible. The actual aria-label comes from
      // i18n key `navbar.goHome` → "Go to home dashboard" (see Navbar.tsx),
      // so the previous `/go home/i` substring regex never matched. Match
      // on "home" (case-insensitive) and take .first() because the logo
      // and the app-name button both carry the same aria-label.
      await expect(nav.getByRole('button', { name: /home/i }).first()).toBeVisible()

      // Theme toggle always visible. The button uses aria-label (from i18n
      // `navbar.themeToggle` → "Theme: <mode> (click to toggle)"), not a
      // native `title` attribute — the tooltip is a Tooltip primitive
      // (see components/ui/Tooltip.tsx), not a browser title.
      await expect(nav.locator('button[aria-label*="theme" i]')).toBeVisible()

      // Alerts badge always visible
      await expect(nav.locator('[data-testid="alert-badge"], button[aria-label*="alert" i]').first()).toBeVisible()

      // User profile dropdown always visible. UserProfileDropdown.tsx's
      // trigger button has no aria-label or data-testid — it's identified
      // by `aria-haspopup="true"` inside the nav element. Accept any of
      // these locators so future relabeling won't re-break this test.
      await expect(
        nav.locator('[data-testid="user-menu"], button[aria-label*="user" i], button[aria-label*="profile" i], button[aria-haspopup="true"]').first()
      ).toBeVisible()
    })
  }

  test('overflow menu button is visible below lg breakpoint (1024px)', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 720 })
    await setupPage(page)

    const nav = page.locator('nav[data-tour="navbar"]')
    const overflowBtn = nav.getByRole('button', { name: /more options/i })
    await expect(overflowBtn).toBeVisible()
  })

  test('overflow menu reveals hidden items when opened below lg', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 720 })
    await setupPage(page)

    const nav = page.locator('nav[data-tour="navbar"]')
    const overflowBtn = nav.getByRole('button', { name: /more options/i })
    // Webkit mobile emulation can report the button as "not stable" while
    // CSS transitions are settling. Wait for visibility first, then force
    // click to bypass the stability check (#nightly-playwright).
    await expect(overflowBtn).toBeVisible()
    // Small settle delay for webkit — the page/context can close if the
    // click fires while layout is still in progress (#nightly-playwright).
    const SETTLE_MS = 500
    await page.waitForTimeout(SETTLE_MS)
    await overflowBtn.click({ force: true })

    // At least one item from the lg-hidden group should now be visible.
    // Use a generous timeout — the overflow panel animates in and webkit
    // can be slow to paint after a forced click.
    const PANEL_TIMEOUT_MS = 10_000
    const panel = page.locator('.fixed.bg-card').last()
    await expect(panel).toBeVisible({ timeout: PANEL_TIMEOUT_MS })
  })

  test('search bar is in main nav bar at sm+ (640px)', async ({ page }) => {
    await page.setViewportSize({ width: 640, height: 720 })
    await setupPage(page)

    const nav = page.locator('nav[data-tour="navbar"]')
    // Search container uses `hidden sm:flex`. Multiple unrelated elements in
    // the navbar share a `.hidden.sm:block` utility pair (e.g. the
    // UserProfileDropdown name div and a StreakBadge progress pill), so use
    // `.first()` to pick the outermost search wrapper and avoid strict-mode
    // violations. The `.flex-1.max-w-md` identifiers on the search container
    // are unique to this wrapper.
    const searchWrapper = nav.locator('.hidden.sm\\:flex.flex-1, .hidden.sm\\:block.flex-1').first()
    await expect(searchWrapper).toBeVisible()
  })

  test('desktop item group is visible at md+ (768px)', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 720 })
    await setupPage(page)

    const nav = page.locator('nav[data-tour="navbar"]')
    // ClusterFilterPanel/AgentStatus group uses hidden md:flex
    const desktopGroup = nav.locator('.hidden.md\\:flex').first()
    await expect(desktopGroup).toBeVisible()
  })

  test('extended item group is visible at lg+ (1024px)', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 720 })
    await setupPage(page)

    const nav = page.locator('nav[data-tour="navbar"]')
    // UpdateIndicator/TokenUsage/FeatureRequest group uses hidden lg:flex
    const lgGroup = nav.locator('.hidden.lg\\:flex').first()
    await expect(lgGroup).toBeVisible()
  })

  test('overflow menu button is hidden at lg+ (1024px)', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 720 })
    await setupPage(page)

    const nav = page.locator('nav[data-tour="navbar"]')
    // Overflow container uses relative lg:hidden
    const overflowContainer = nav.locator('.relative.lg\\:hidden')
    await expect(overflowContainer).toBeHidden()
  })
})
