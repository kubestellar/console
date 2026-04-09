import { test, expect, type Page } from '@playwright/test'

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

/** Max time to wait for story content to render */
const STORY_RENDER_TIMEOUT_MS = 15_000

async function navigateToStory(page: Page, storyId: string) {
  await page.goto(`/iframe.html?id=${storyId}&viewMode=story`, { waitUntil: 'networkidle' })
  // Wait for the story to render — look for any child content inside #storybook-root
  await page.locator('#storybook-root > *').first().waitFor({
    state: 'visible',
    timeout: STORY_RENDER_TIMEOUT_MS,
  })
}

// ── Button ─────────────────────────────────────────────────────────────────

test.describe('Button', () => {
  test('primary variant', async ({ page }) => {
    await navigateToStory(page, 'ui-button--primary')
    await expect(page).toHaveScreenshot('button-primary.png')
  })

  test('all variants', async ({ page }) => {
    await navigateToStory(page, 'ui-button--all-variants')
    await expect(page).toHaveScreenshot('button-all-variants.png')
  })

  test('all sizes', async ({ page }) => {
    await navigateToStory(page, 'ui-button--all-sizes')
    await expect(page).toHaveScreenshot('button-all-sizes.png')
  })

  test('loading state', async ({ page }) => {
    await navigateToStory(page, 'ui-button--loading')
    await expect(page).toHaveScreenshot('button-loading.png')
  })

  test('disabled state', async ({ page }) => {
    await navigateToStory(page, 'ui-button--disabled')
    await expect(page).toHaveScreenshot('button-disabled.png')
  })
})

// ── StatusBadge ────────────────────────────────────────────────────────────

test.describe('StatusBadge', () => {
  test('all colors', async ({ page }) => {
    await navigateToStory(page, 'ui-statusbadge--all-colors')
    await expect(page).toHaveScreenshot('statusbadge-all-colors.png')
  })

  test('all colors outline', async ({ page }) => {
    await navigateToStory(page, 'ui-statusbadge--all-colors-outline')
    await expect(page).toHaveScreenshot('statusbadge-all-colors-outline.png')
  })

  test('all colors solid', async ({ page }) => {
    await navigateToStory(page, 'ui-statusbadge--all-colors-solid')
    await expect(page).toHaveScreenshot('statusbadge-all-colors-solid.png')
  })

  test('all sizes', async ({ page }) => {
    await navigateToStory(page, 'ui-statusbadge--all-sizes')
    await expect(page).toHaveScreenshot('statusbadge-all-sizes.png')
  })
})

// ── Skeleton ───────────────────────────────────────────────────────────────

test.describe('Skeleton', () => {
  test('text variant', async ({ page }) => {
    await navigateToStory(page, 'ui-skeleton--text-variant')
    await expect(page).toHaveScreenshot('skeleton-text.png')
  })

  test('circular variant', async ({ page }) => {
    await navigateToStory(page, 'ui-skeleton--circular')
    await expect(page).toHaveScreenshot('skeleton-circular.png')
  })

  test('card skeleton', async ({ page }) => {
    await navigateToStory(page, 'ui-skeleton--card-skeleton')
    await expect(page).toHaveScreenshot('skeleton-card.png')
  })
})

// ── CodeBlock ──────────────────────────────────────────────────────────────

test.describe('CodeBlock', () => {
  test('YAML', async ({ page }) => {
    await navigateToStory(page, 'ui-codeblock--yaml')
    await expect(page).toHaveScreenshot('codeblock-yaml.png')
  })

  test('bash', async ({ page }) => {
    await navigateToStory(page, 'ui-codeblock--bash')
    await expect(page).toHaveScreenshot('codeblock-bash.png')
  })
})

// ── CollapsibleSection ─────────────────────────────────────────────────────

test.describe('CollapsibleSection', () => {
  test('default open', async ({ page }) => {
    await navigateToStory(page, 'ui-collapsiblesection--default')
    await expect(page).toHaveScreenshot('collapsible-default.png')
  })

  test('collapsed', async ({ page }) => {
    await navigateToStory(page, 'ui-collapsiblesection--collapsed')
    await expect(page).toHaveScreenshot('collapsible-collapsed.png')
  })
})

// ── Pagination ─────────────────────────────────────────────────────────────

test.describe('Pagination', () => {
  test('default', async ({ page }) => {
    await navigateToStory(page, 'ui-pagination--default')
    await expect(page).toHaveScreenshot('pagination-default.png')
  })

  test('many pages', async ({ page }) => {
    await navigateToStory(page, 'ui-pagination--many-pages')
    await expect(page).toHaveScreenshot('pagination-many-pages.png')
  })
})

// ── ProgressRing ───────────────────────────────────────────────────────────

test.describe('ProgressRing', () => {
  test('all progress levels', async ({ page }) => {
    await navigateToStory(page, 'ui-progressring--all-progress-levels')
    await expect(page).toHaveScreenshot('progressring-all-levels.png')
  })

  test('different sizes', async ({ page }) => {
    await navigateToStory(page, 'ui-progressring--different-sizes')
    await expect(page).toHaveScreenshot('progressring-sizes.png')
  })
})

// ── LogoWithStar ───────────────────────────────────────────────────────────

test.describe('LogoWithStar', () => {
  test('default', async ({ page }) => {
    await navigateToStory(page, 'ui-logowithstar--default')
    await expect(page).toHaveScreenshot('logo-default.png')
  })

  test('all sizes', async ({ page }) => {
    await navigateToStory(page, 'ui-logowithstar--all-sizes')
    await expect(page).toHaveScreenshot('logo-all-sizes.png')
  })
})

// ── CloudProviderIcon ──────────────────────────────────────────────────────

test.describe('CloudProviderIcon', () => {
  test('all providers', async ({ page }) => {
    await navigateToStory(page, 'ui-cloudprovidericon--all-providers')
    await expect(page).toHaveScreenshot('cloudprovider-all.png')
  })
})

// ── ClusterStatusBadge ─────────────────────────────────────────────────────

test.describe('ClusterStatusBadge', () => {
  test('all states', async ({ page }) => {
    await navigateToStory(page, 'ui-clusterstatusbadge--all-states')
    await expect(page).toHaveScreenshot('clusterstatus-all-states.png')
  })
})

// ── AccessibleStatus ───────────────────────────────────────────────────────

test.describe('AccessibleStatus', () => {
  test('all statuses', async ({ page }) => {
    await navigateToStory(page, 'ui-accessiblestatus--all-statuses')
    await expect(page).toHaveScreenshot('accessible-all-statuses.png')
  })
})

// ── RefreshIndicator ───────────────────────────────────────────────────────

test.describe('RefreshIndicator', () => {
  test('idle', async ({ page }) => {
    await navigateToStory(page, 'ui-refreshindicator--idle')
    await expect(page).toHaveScreenshot('refresh-idle.png')
  })

  test('refreshing', async ({ page }) => {
    await navigateToStory(page, 'ui-refreshindicator--refreshing')
    await expect(page).toHaveScreenshot('refresh-refreshing.png')
  })
})

// ── LimitedAccessWarning ───────────────────────────────────────────────────

test.describe('LimitedAccessWarning', () => {
  test('demo data mode', async ({ page }) => {
    await navigateToStory(page, 'ui-limitedaccesswarning--demo-data-mode')
    await expect(page).toHaveScreenshot('limitedaccess-demo.png')
  })
})
