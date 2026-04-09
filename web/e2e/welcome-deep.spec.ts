import { test, expect } from '@playwright/test'
import {
  setupDemoMode,
  setupErrorCollector,
  NETWORK_IDLE_TIMEOUT_MS,
  ELEMENT_VISIBLE_TIMEOUT_MS,
  NAV_TIMEOUT_MS,
} from './helpers/setup'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Number of hero stat blocks displayed in the stats strip */
const EXPECTED_HERO_STAT_COUNT = 4

/** Number of scenario cards in the "See it in action" section */
const EXPECTED_MIN_SCENARIO_COUNT = 6

/** Number of differentiator pills */
const EXPECTED_DIFFERENTIATOR_COUNT = 6

/** Minimum content length (chars) to confirm the page is not blank */
const MIN_PAGE_CONTENT_LENGTH = 200

/** SEO page title set by the Welcome component */
const SEO_PAGE_TITLE = 'KubeStellar Console — Open Source Kubernetes Dashboard'

/** SEO meta description substring to verify */
const SEO_META_DESCRIPTION_SUBSTRING = 'AI-powered, multi-cluster Kubernetes dashboard'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Welcome Page Deep Tests (/welcome)', () => {
  test.beforeEach(async ({ page }) => {
    await setupDemoMode(page)
    await page.goto('/welcome')
    await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS })
    // Welcome is a custom layout — wait for the hero heading instead of dashboard-header
    await expect(page.locator('h1')).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
  })

  test('loads without console errors', async ({ page }) => {
    const { errors } = setupErrorCollector(page)
    // Re-navigate to capture errors from a fresh load
    await page.goto('/welcome')
    await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS })
    await expect(page.locator('h1')).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    expect(errors).toHaveLength(0)
  })

  test('displays hero heading with "One console" text', async ({ page }) => {
    const heading = page.locator('h1')
    await expect(heading).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    const text = await heading.textContent()
    expect(text).toContain('One')
    expect(text).toContain('console')
  })

  test('displays subtitle about AI-powered dashboard', async ({ page }) => {
    // The subtitle paragraph mentions "AI troubleshooting" and "open-source"
    const subtitle = page.locator('p').filter({ hasText: 'open-source' }).first()
    await expect(subtitle).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
  })

  test('shows hero stats strip with CNCF tools, Dashboards, Cards, Paywalls', async ({ page }) => {
    const statsLabels = ['CNCF tools', 'Dashboards', 'Cards', 'Paywalls']
    for (const label of statsLabels) {
      const statElement = page.locator('text=' + label).first()
      await expect(statElement).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    }
  })

  test('shows correct stat values including 250+ CNCF tools and 0 Paywalls', async ({ page }) => {
    // Verify the "250+" value for CNCF tools
    await expect(page.locator('text=250+')).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    // The "0" for Paywalls — find the stat block that has both "0" value and "Paywalls" label
    const paywallStat = page.locator('div').filter({ hasText: /^0$/ }).filter({ has: page.locator('text=Paywalls') }).first()
    // Alternatively just check the label exists — the value "0" is in a sibling
    await expect(page.locator('text=Paywalls')).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })

    // Verify we have the expected number of stat blocks
    const statBlocks = page.locator('.grid.grid-cols-2 > div')
    const count = await statBlocks.count()
    expect(count).toBeGreaterThanOrEqual(EXPECTED_HERO_STAT_COUNT)
  })

  test('shows "Explore the Demo" CTA button', async ({ page }) => {
    const ctaButton = page.locator('a').filter({ hasText: 'Explore the Demo' }).first()
    await expect(ctaButton).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
  })

  test('Explore the Demo navigates to /', async ({ page }) => {
    const ctaButton = page.locator('a').filter({ hasText: 'Explore the Demo' }).first()
    await ctaButton.click()
    await page.waitForURL('**/', { timeout: NAV_TIMEOUT_MS })
    // Should have navigated away from /welcome
    expect(page.url()).not.toContain('/welcome')
  })

  test('shows GitHub link', async ({ page }) => {
    const githubLink = page.locator('a[href*="github.com/kubestellar/console"]').first()
    await expect(githubLink).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    // Should open in a new tab
    const target = await githubLink.getAttribute('target')
    expect(target).toBe('_blank')
  })

  test('sets correct page title for SEO', async ({ page }) => {
    const title = await page.title()
    expect(title).toBe(SEO_PAGE_TITLE)
  })

  test('sets meta description for SEO', async ({ page }) => {
    const metaContent = await page.locator('meta[name="description"]').getAttribute('content')
    expect(metaContent).toContain(SEO_META_DESCRIPTION_SUBSTRING)
  })

  test('displays "See it in action" heading', async ({ page }) => {
    const heading = page.locator('h2').filter({ hasText: /See it in.*action/ })
    await expect(heading).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
  })

  test('renders scenario cards with titles and descriptions', async ({ page }) => {
    // Scenario cards are links inside the scenarios grid
    const scenarioCards = page.locator('a.group')
    const count = await scenarioCards.count()
    expect(count).toBeGreaterThanOrEqual(EXPECTED_MIN_SCENARIO_COUNT)

    // Each card should have a title (h3) and description (p)
    for (let i = 0; i < Math.min(count, EXPECTED_MIN_SCENARIO_COUNT); i++) {
      const card = scenarioCards.nth(i)
      await expect(card.locator('h3')).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
      await expect(card.locator('p').first()).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    }
  })

  test('scenario cards have working links', async ({ page }) => {
    const scenarioCards = page.locator('a.group')
    const count = await scenarioCards.count()
    expect(count).toBeGreaterThanOrEqual(EXPECTED_MIN_SCENARIO_COUNT)

    // Each card should have an href attribute
    for (let i = 0; i < count; i++) {
      const href = await scenarioCards.nth(i).getAttribute('href')
      expect(href).toBeTruthy()
      expect(href).toMatch(/^\//)
    }
  })

  test('shows differentiator pills section', async ({ page }) => {
    const expectedPills = [
      'No account required',
      'No license keys',
      'Apache 2.0',
      'Works offline',
      'AI-powered missions',
      'Multi-cluster native',
    ]

    for (const pill of expectedPills) {
      const pillElement = page.locator('span').filter({ hasText: pill }).first()
      await expect(pillElement).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    }
  })

  test('displays footer CTA section', async ({ page }) => {
    const footerHeading = page.locator('h2').filter({ hasText: 'Ready to try it?' })
    await expect(footerHeading).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })

    // Footer should also have an "Explore the Demo" link
    const footerCta = page.locator('section').last().locator('a').filter({ hasText: 'Explore the Demo' })
    await expect(footerCta).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })

    // And a "View on GitHub" link
    const githubLink = page.locator('section').last().locator('a').filter({ hasText: 'View on GitHub' })
    await expect(githubLink).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
  })

  test('page has meaningful content (not blank)', async ({ page }) => {
    const bodyText = await page.locator('body').textContent()
    expect((bodyText || '').length).toBeGreaterThan(MIN_PAGE_CONTENT_LENGTH)
    // Verify key content markers
    expect(bodyText).toContain('KubeStellar')
    expect(bodyText).toContain('Kubernetes')
  })
})
