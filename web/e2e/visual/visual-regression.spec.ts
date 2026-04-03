import { test, expect } from '@playwright/test'

/**
 * Visual regression tests for UI components via Storybook.
 *
 * Each test navigates to a story's isolated iframe and captures a screenshot.
 * Playwright compares against stored baselines and fails if the visual diff
 * exceeds the threshold configured in visual.config.ts.
 *
 * Story ID format: ui-componentname--storyname (lowercase, hyphens)
 *
 * To update baselines after intentional changes:
 *   cd web && npm run build-storybook && npx playwright test --config e2e/visual/visual.config.ts --update-snapshots
 */

/** Wait for story to fully render (fonts, animations disabled by config) */
const RENDER_WAIT_MS = 500

async function navigateToStory(page: ReturnType<typeof test.info>['_test'] extends never ? never : Awaited<ReturnType<typeof import('@playwright/test')['test']['info']>>['_test'] extends never ? never : import('@playwright/test').Page, storyId: string) {
  await page.goto(`/iframe.html?id=${storyId}&viewMode=story`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(RENDER_WAIT_MS)
}

// ── Button ─────────────────────────────────────────────────────────────────

test.describe('Button', () => {
  test('primary variant', async ({ page }) => {
    await navigateToStory(page, 'ui-button--primary')
    await expect(page.locator('#storybook-root')).toHaveScreenshot('button-primary.png')
  })

  test('all variants', async ({ page }) => {
    await navigateToStory(page, 'ui-button--all-variants')
    await expect(page.locator('#storybook-root')).toHaveScreenshot('button-all-variants.png')
  })

  test('all sizes', async ({ page }) => {
    await navigateToStory(page, 'ui-button--all-sizes')
    await expect(page.locator('#storybook-root')).toHaveScreenshot('button-all-sizes.png')
  })

  test('loading state', async ({ page }) => {
    await navigateToStory(page, 'ui-button--loading')
    await expect(page.locator('#storybook-root')).toHaveScreenshot('button-loading.png')
  })

  test('disabled state', async ({ page }) => {
    await navigateToStory(page, 'ui-button--disabled')
    await expect(page.locator('#storybook-root')).toHaveScreenshot('button-disabled.png')
  })
})

// ── StatusBadge ────────────────────────────────────────────────────────────

test.describe('StatusBadge', () => {
  test('all colors', async ({ page }) => {
    await navigateToStory(page, 'ui-statusbadge--all-colors')
    await expect(page.locator('#storybook-root')).toHaveScreenshot('statusbadge-all-colors.png')
  })

  test('all colors outline', async ({ page }) => {
    await navigateToStory(page, 'ui-statusbadge--all-colors-outline')
    await expect(page.locator('#storybook-root')).toHaveScreenshot('statusbadge-all-colors-outline.png')
  })

  test('all colors solid', async ({ page }) => {
    await navigateToStory(page, 'ui-statusbadge--all-colors-solid')
    await expect(page.locator('#storybook-root')).toHaveScreenshot('statusbadge-all-colors-solid.png')
  })

  test('all sizes', async ({ page }) => {
    await navigateToStory(page, 'ui-statusbadge--all-sizes')
    await expect(page.locator('#storybook-root')).toHaveScreenshot('statusbadge-all-sizes.png')
  })
})

// ── Skeleton ───────────────────────────────────────────────────────────────

test.describe('Skeleton', () => {
  test('text variant', async ({ page }) => {
    await navigateToStory(page, 'ui-skeleton--text')
    await expect(page.locator('#storybook-root')).toHaveScreenshot('skeleton-text.png')
  })

  test('circular variant', async ({ page }) => {
    await navigateToStory(page, 'ui-skeleton--circular')
    await expect(page.locator('#storybook-root')).toHaveScreenshot('skeleton-circular.png')
  })

  test('card skeleton', async ({ page }) => {
    await navigateToStory(page, 'ui-skeleton--card')
    await expect(page.locator('#storybook-root')).toHaveScreenshot('skeleton-card.png')
  })
})

// ── CodeBlock ──────────────────────────────────────────────────────────────

test.describe('CodeBlock', () => {
  test('YAML', async ({ page }) => {
    await navigateToStory(page, 'ui-codeblock--yaml')
    await expect(page.locator('#storybook-root')).toHaveScreenshot('codeblock-yaml.png')
  })

  test('bash', async ({ page }) => {
    await navigateToStory(page, 'ui-codeblock--bash')
    await expect(page.locator('#storybook-root')).toHaveScreenshot('codeblock-bash.png')
  })
})

// ── CollapsibleSection ─────────────────────────────────────────────────────

test.describe('CollapsibleSection', () => {
  test('default open', async ({ page }) => {
    await navigateToStory(page, 'ui-collapsiblesection--default')
    await expect(page.locator('#storybook-root')).toHaveScreenshot('collapsible-default.png')
  })

  test('collapsed', async ({ page }) => {
    await navigateToStory(page, 'ui-collapsiblesection--collapsed')
    await expect(page.locator('#storybook-root')).toHaveScreenshot('collapsible-collapsed.png')
  })
})

// ── Pagination ─────────────────────────────────────────────────────────────

test.describe('Pagination', () => {
  test('default', async ({ page }) => {
    await navigateToStory(page, 'ui-pagination--default')
    await expect(page.locator('#storybook-root')).toHaveScreenshot('pagination-default.png')
  })

  test('many pages', async ({ page }) => {
    await navigateToStory(page, 'ui-pagination--many-pages')
    await expect(page.locator('#storybook-root')).toHaveScreenshot('pagination-many-pages.png')
  })
})

// ── ProgressRing ───────────────────────────────────────────────────────────

test.describe('ProgressRing', () => {
  test('all progress levels', async ({ page }) => {
    await navigateToStory(page, 'ui-progressring--all-progress-levels')
    await expect(page.locator('#storybook-root')).toHaveScreenshot('progressring-all-levels.png')
  })

  test('different sizes', async ({ page }) => {
    await navigateToStory(page, 'ui-progressring--different-sizes')
    await expect(page.locator('#storybook-root')).toHaveScreenshot('progressring-sizes.png')
  })
})

// ── LogoWithStar ───────────────────────────────────────────────────────────

test.describe('LogoWithStar', () => {
  test('default', async ({ page }) => {
    await navigateToStory(page, 'ui-logowithstar--default')
    await expect(page.locator('#storybook-root')).toHaveScreenshot('logo-default.png')
  })

  test('all sizes', async ({ page }) => {
    await navigateToStory(page, 'ui-logowithstar--all-sizes')
    await expect(page.locator('#storybook-root')).toHaveScreenshot('logo-all-sizes.png')
  })
})

// ── CloudProviderIcon ──────────────────────────────────────────────────────

test.describe('CloudProviderIcon', () => {
  test('all providers', async ({ page }) => {
    await navigateToStory(page, 'ui-cloudprovidericon--all-providers')
    await expect(page.locator('#storybook-root')).toHaveScreenshot('cloudprovider-all.png')
  })
})

// ── ClusterStatusBadge ─────────────────────────────────────────────────────

test.describe('ClusterStatusBadge', () => {
  test('all states', async ({ page }) => {
    await navigateToStory(page, 'ui-clusterstatusbadge--all-states')
    await expect(page.locator('#storybook-root')).toHaveScreenshot('clusterstatus-all-states.png')
  })
})

// ── AccessibleStatus ───────────────────────────────────────────────────────

test.describe('AccessibleStatus', () => {
  test('all statuses', async ({ page }) => {
    await navigateToStory(page, 'ui-accessiblestatus--all-statuses')
    await expect(page.locator('#storybook-root')).toHaveScreenshot('accessible-all-statuses.png')
  })
})

// ── RefreshIndicator ───────────────────────────────────────────────────────

test.describe('RefreshIndicator', () => {
  test('idle', async ({ page }) => {
    await navigateToStory(page, 'ui-refreshindicator--idle')
    await expect(page.locator('#storybook-root')).toHaveScreenshot('refresh-idle.png')
  })

  test('refreshing', async ({ page }) => {
    await navigateToStory(page, 'ui-refreshindicator--refreshing')
    await expect(page.locator('#storybook-root')).toHaveScreenshot('refresh-refreshing.png')
  })
})

// ── LimitedAccessWarning ───────────────────────────────────────────────────

test.describe('LimitedAccessWarning', () => {
  test('demo data mode', async ({ page }) => {
    await navigateToStory(page, 'ui-limitedaccesswarning--demo-data-mode')
    await expect(page.locator('#storybook-root')).toHaveScreenshot('limitedaccess-demo.png')
  })
})
