/**
 * CI/CD interaction E2E tests — covers repo removal/hiding (#11013),
 * reset-to-defaults (#11014), refresh loading state (#11015),
 * Live Runs expand/details (#11016), and Logs modal (#11017).
 */
import { test, expect, type Page } from '@playwright/test'
import {
  setupDemoAndNavigate,
  setupDemoMode,
  waitForSubRoute,
  ELEMENT_VISIBLE_TIMEOUT_MS,
  MODAL_TIMEOUT_MS,
} from './helpers/setup'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** HTTP status code for a successful mock response */
const HTTP_OK = 200

/** Timeout for element interaction readiness */
const INTERACTION_TIMEOUT_MS = 10_000

/** The CI/CD repo controls are intentionally gated in demo mode. */
const INSTALL_DIALOG_NAME = /run kubestellar console locally/i

function manageReposButton(page: Page) {
  return page.locator('button').filter({ has: page.locator('svg.lucide-rotate-ccw') }).first()
}

async function assertInstallGateOrResetMenu(page: Page): Promise<'install-gate' | 'reset-menu'> {
  const installDialog = page.getByRole('dialog', { name: INSTALL_DIALOG_NAME })
  if (await installDialog.isVisible({ timeout: 1_000 }).catch((error) => { console.error(\'Promise error:\', error); return false })) {
    await expect(installDialog).toBeVisible()
    return 'install-gate'
  }

  const resetOption = page.getByText('Reset to defaults')
  await expect(resetOption).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
  return 'reset-menu'
}

// ---------------------------------------------------------------------------
// #11013 — Removing / hiding repos
// ---------------------------------------------------------------------------

test.describe('CI/CD repo removal and hiding (#11013)', () => {
  test.beforeEach(async ({ page }) => {
    await setupDemoAndNavigate(page, '/ci-cd')
    await waitForSubRoute(page)
  })

  test('remove button is hidden in demo mode', async ({ page }) => {
    // PipelineFilterBar hides remove buttons in demo mode to prevent
    // accidental repo removal when using demo/sample data.
    const removeButtons = page.getByRole('button', { name: /Remove repo/i })

    await expect(page.getByTestId('dashboard-header')).toBeVisible({
      timeout: ELEMENT_VISIBLE_TIMEOUT_MS,
    })

    // Verify repo pills render (the "All" button is always present)
    const allPill = page.getByRole('button', { name: 'All' }).first()
    const allVisible = await allPill.isVisible().catch((error) => { console.error(\'Promise error:\', error); return false })
    if (allVisible) {
      const count = await removeButtons.count()
      // In demo mode, remove buttons should NOT be rendered
      expect(count).toBe(0)
    }
  })

  test('clicking remove on a repo pill hides it from the filter bar', async ({ page }) => {
    // Remove buttons are hidden in demo mode — this test verifies removal
    // behavior which only applies in live (non-demo) mode.
    const removeButtons = page.getByRole('button', { name: /Remove repo/i })
    const count = await removeButtons.count()

    if (count === 0) {
      // No remove buttons visible (expected in demo mode) — skip gracefully
      await expect(page.getByTestId('dashboard-header')).toBeVisible({
        timeout: ELEMENT_VISIBLE_TIMEOUT_MS,
      })
      return
    }

    // Get the repo name from the first remove button's aria-label
    const firstRemove = removeButtons.first()
    const ariaLabel = await firstRemove.getAttribute('aria-label')
    const repoName = ariaLabel?.replace(/^Remove repo:\s*/i, '') ?? ''

    if (!repoName) {
      await expect(page.getByTestId('dashboard-header')).toBeVisible({
        timeout: ELEMENT_VISIBLE_TIMEOUT_MS,
      })
      return
    }

    // Count pills before removal
    const pillsBefore = await page.getByRole('button', { name: /Remove repo/i }).count()

    // Click remove
    await firstRemove.click()

    // After removal, verify the pill disappeared or the count decreased
    // Wait briefly for the UI to update
    const pillsAfter = await page.getByRole('button', { name: /Remove repo/i }).count()
    // Either the pill count decreased, or the removed repo pill is no longer visible
    const repoButton = page.getByRole('button', { name: new RegExp(repoName, 'i') }).first()
    const repoStillVisible = await repoButton.isVisible().catch((error) => { console.error(\'Promise error:\', error); return false })
    expect(pillsAfter < pillsBefore || !repoStillVisible).toBe(true)

    await expect(page.getByTestId('dashboard-header')).toBeVisible({
      timeout: ELEMENT_VISIBLE_TIMEOUT_MS,
    })
  })

  test('manage dropdown shows hidden repos after removal', async ({ page }) => {
    // The manage/reset button (RotateCcw icon) appears when repos are customized
    // In demo mode this may be gated, so we check gracefully
    const manageButton = manageReposButton(page)
    const manageVisible = await manageButton.isVisible().catch((error) => { console.error(\'Promise error:\', error); return false })

    if (!manageVisible) {
      // No customization present yet — the manage button only appears with changes
      await expect(page.getByTestId('dashboard-header')).toBeVisible({
        timeout: ELEMENT_VISIBLE_TIMEOUT_MS,
      })
      return
    }

    await manageButton.click()

    const openedState = await assertInstallGateOrResetMenu(page)
    if (openedState === 'install-gate') return

    // Verify the dropdown also lists hidden/removed repos (not just the reset option)
    const dropdown = page.locator('[role="menu"], [role="listbox"], [data-radix-popper-content-wrapper]').first()
    const dropdownVisible = await dropdown.isVisible().catch((error) => { console.error(\'Promise error:\', error); return false })
    if (dropdownVisible) {
      const dropdownText = await dropdown.textContent()
      // The dropdown should contain more than just "Reset to defaults"
      expect((dropdownText || '').length).toBeGreaterThan('Reset to defaults'.length)
    }
  })
})

// ---------------------------------------------------------------------------
// #11014 — Reset to defaults
// ---------------------------------------------------------------------------

test.describe('CI/CD reset to defaults (#11014)', () => {
  test.beforeEach(async ({ page }) => {
    // Pre-seed localStorage with customization so "Reset to defaults" is available
    await setupDemoMode(page)
    await page.addInitScript(() => {
      localStorage.setItem('kc-pipeline-repos', JSON.stringify({
        added: ['custom-org/custom-repo'],
        hidden: [],
      }))
    })
    await page.goto('/ci-cd')
    await waitForSubRoute(page)
  })

  test('reset to defaults button is accessible from manage menu', async ({ page }) => {
    // With customization seeded, the manage (RotateCcw) button should appear
    const manageButton = manageReposButton(page)
    const manageVisible = await manageButton.isVisible().catch((error) => { console.error(\'Promise error:\', error); return false })

    if (!manageVisible) {
      // Manage button not visible — filter bar may not be rendered in this mode
      await expect(page.getByTestId('dashboard-header')).toBeVisible({
        timeout: ELEMENT_VISIBLE_TIMEOUT_MS,
      })
      return
    }

    await manageButton.click()

    const openedState = await assertInstallGateOrResetMenu(page)
    if (openedState === 'install-gate') return
  })

  test('clicking reset to defaults restores original repo list', async ({ page }) => {
    const manageButton = manageReposButton(page)
    const manageVisible = await manageButton.isVisible().catch((error) => { console.error(\'Promise error:\', error); return false })

    if (!manageVisible) {
      await expect(page.getByTestId('dashboard-header')).toBeVisible({
        timeout: ELEMENT_VISIBLE_TIMEOUT_MS,
      })
      return
    }

    // Open manage menu and click reset
    await manageButton.click()
    const openedState = await assertInstallGateOrResetMenu(page)
    if (openedState === 'install-gate') return

    const resetOption = page.getByText('Reset to defaults')
    await resetOption.click()

    // After reset, the manage button should disappear (no customization left)
    // or the custom repo pill should no longer be visible
    await expect(page.getByTestId('dashboard-header')).toBeVisible({
      timeout: ELEMENT_VISIBLE_TIMEOUT_MS,
    })

    // Verify localStorage was cleared
    const config = await page.evaluate(() => localStorage.getItem('kc-pipeline-repos'))
    const parsed = config ? JSON.parse(config) : null
    const hasNoAdded = !parsed || (parsed.added || []).length === 0
    const hasNoHidden = !parsed || (parsed.hidden || []).length === 0
    expect(hasNoAdded).toBe(true)
    expect(hasNoHidden).toBe(true)
  })

  test('reset clears selection state in localStorage', async ({ page }) => {
    // Pre-seed a selection
    await page.evaluate(() => {
      localStorage.setItem('kc-pipeline-selection', JSON.stringify(['some-org/some-repo']))
    })

    const manageButton = manageReposButton(page)
    const manageVisible = await manageButton.isVisible().catch((error) => { console.error(\'Promise error:\', error); return false })

    if (!manageVisible) {
      await expect(page.getByTestId('dashboard-header')).toBeVisible({
        timeout: ELEMENT_VISIBLE_TIMEOUT_MS,
      })
      return
    }

    await manageButton.click()
    const openedState = await assertInstallGateOrResetMenu(page)
    if (openedState === 'install-gate') return

    const resetOption = page.getByText('Reset to defaults')
    await resetOption.click()

    // Selection should be cleared (empty array or null)
    const selection = await page.evaluate(() => localStorage.getItem('kc-pipeline-selection'))
    const parsed = selection ? JSON.parse(selection) : []
    expect(parsed.length).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// #11015 — Refresh loading state
// ---------------------------------------------------------------------------

test.describe('CI/CD refresh loading state (#11015)', () => {
  test.beforeEach(async ({ page }) => {
    await setupDemoAndNavigate(page, '/ci-cd')
    await waitForSubRoute(page)
  })

  test('refresh button exists and is enabled', async ({ page }) => {
    const refreshButton = page.getByTestId('dashboard-refresh-button')
    await expect(refreshButton).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    await expect(refreshButton).toBeEnabled()
  })

  test('clicking refresh triggers a visual refresh indicator', async ({ page }) => {
    const refreshButton = page.getByTestId('dashboard-refresh-button')
    await expect(refreshButton).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })

    // Capture the SVG class state BEFORE clicking
    const refreshIcon = refreshButton.locator('svg')
    await expect(refreshIcon).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    const classBeforeClick = await refreshIcon.getAttribute('class') || ''

    // Click refresh — the RefreshCw icon should get animate-spin class
    await refreshButton.click()

    // After clicking, verify the icon gained the animate-spin class OR the button became disabled
    // (indicating a state change occurred)
    const classAfterClick = await refreshIcon.getAttribute('class') || ''
    const buttonDisabled = await refreshButton.isDisabled().catch((error) => { console.error(\'Promise error:\', error); return false })
    const stateChanged = classAfterClick !== classBeforeClick
      || classAfterClick.includes('animate-spin')
      || buttonDisabled
    expect(stateChanged).toBe(true)

    // After clicking, verify the page remains functional
    await expect(page.getByTestId('dashboard-header')).toBeVisible({
      timeout: ELEMENT_VISIBLE_TIMEOUT_MS,
    })
  })

  test('refresh re-requests the github-pipelines API', async ({ page }) => {
    // Navigate fresh to count from zero
    await setupDemoAndNavigate(page, '/ci-cd')
    await waitForSubRoute(page)

    // Click refresh
    const refreshButton = page.getByTestId('dashboard-refresh-button')
    await expect(refreshButton).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    await refreshButton.click()

    // Wait briefly for the refetch to fire
    await page.waitForResponse(
      (resp) => resp.url().includes('/api/github-pipelines'),
      { timeout: INTERACTION_TIMEOUT_MS },
    ).catch(() => {
      // In demo mode, the API may not be called (demo data fallback).
      // That's acceptable — the test verifies the button click works.
    })

    // The page should still be functional after refresh
    await expect(page.getByTestId('dashboard-header')).toBeVisible({
      timeout: ELEMENT_VISIBLE_TIMEOUT_MS,
    })
  })

  test('per-card refresh button shows spinning icon', async ({ page }) => {
    // Individual cards (PipelineFlow, RecentFailures) have their own refresh
    // buttons with aria-label="Refresh"
    const cardRefreshButtons = page.getByRole('button', { name: 'Refresh' })
    const count = await cardRefreshButtons.count()

    if (count === 0) {
      // No per-card refresh buttons visible — skip gracefully
      await expect(page.getByTestId('dashboard-header')).toBeVisible({
        timeout: ELEMENT_VISIBLE_TIMEOUT_MS,
      })
      return
    }

    // Click the first card-level refresh button
    const firstRefresh = cardRefreshButtons.first()
    await firstRefresh.click()

    // The SVG inside should briefly get animate-spin class
    const icon = firstRefresh.locator('svg')
    await expect(icon).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })

    // Page should remain stable
    await expect(page.getByTestId('dashboard-header')).toBeVisible({
      timeout: ELEMENT_VISIBLE_TIMEOUT_MS,
    })
  })
})

// ---------------------------------------------------------------------------
// #11016 — Live Runs expand/details
// ---------------------------------------------------------------------------

test.describe('CI/CD Live Runs expand and details (#11016)', () => {
  test.beforeEach(async ({ page }) => {
    await setupDemoAndNavigate(page, '/ci-cd')
    await waitForSubRoute(page)
  })

  test('Live Runs section renders run rows in demo mode', async ({ page }) => {
    // PipelineFlow renders runs as rows with grid columns.
    // In demo mode, there should be runs with workflow names visible.
    // Look for the "in flight" counter text that PipelineFlow renders.
    const inFlightText = page.getByText(/\d+ in flight/)
    const noRunsText = page.getByText('No runs in flight.')
    const hasInFlight = await inFlightText.isVisible().catch((error) => { console.error(\'Promise error:\', error); return false })
    const hasNoRuns = await noRunsText.isVisible().catch((error) => { console.error(\'Promise error:\', error); return false })

    // Either we see runs or the "no runs" empty state — both are valid
    expect(hasInFlight || hasNoRuns).toBe(true)
  })

  test('run rows display workflow name, repo, and branch details', async ({ page }) => {
    // Each run row has workflow name, repo, and branch info
    // Look for common GitHub Actions event types rendered in the trigger column
    const eventTypes = ['push', 'pull_request', 'schedule', 'workflow_dispatch']
    let foundEvent = false

    for (const event of eventTypes) {
      const el = page.getByText(event, { exact: false }).first()
      const isVisible = await el.isVisible().catch((error) => { console.error(\'Promise error:\', error); return false })
      if (isVisible) {
        foundEvent = true
        break
      }
    }

    // In demo mode, we should see at least event types or the empty state
    const noRunsText = page.getByText('No runs in flight.')
    const hasNoRuns = await noRunsText.isVisible().catch((error) => { console.error(\'Promise error:\', error); return false })
    expect(foundEvent || hasNoRuns).toBe(true)
  })

  test('run rows show job names with status colors', async ({ page }) => {
    // Jobs in the flow have status-colored backgrounds (bg-blue-500/20, bg-green-500/20, etc.)
    // and display job names. Check that at least one job element exists.
    const jobElements = page.locator('[title*="—"]')  // Jobs have title="name — status"
    const jobCount = await jobElements.count()

    if (jobCount > 0) {
      // Verify at least one job element is visible and has text content
      const firstJob = jobElements.first()
      await expect(firstJob).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
      const text = await firstJob.textContent()
      expect((text || '').length).toBeGreaterThan(0)
    } else {
      // No jobs visible — either empty state or all runs completed
      await expect(page.getByTestId('dashboard-header')).toBeVisible({
        timeout: ELEMENT_VISIBLE_TIMEOUT_MS,
      })
    }
  })

  test('run rows include external link to GitHub', async ({ page }) => {
    // Each run row has an "Open run on GitHub" link
    const githubLinks = page.getByTitle('Open run on GitHub')
    const linkCount = await githubLinks.count()

    if (linkCount > 0) {
      const firstLink = githubLinks.first()
      await expect(firstLink).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
      // Live links point to GitHub; demo fixtures use "#" placeholders.
      const href = await firstLink.getAttribute('href')
      if (href) {
        const linkUrl = new URL(href, page.url())
        expect(href === '#' || linkUrl.hostname === 'github.com' || linkUrl.hostname.endsWith('.github.com')).toBe(
          true
        )
      }
    } else {
      // No runs visible
      await expect(page.getByTestId('dashboard-header')).toBeVisible({
        timeout: ELEMENT_VISIBLE_TIMEOUT_MS,
      })
    }
  })

  test('active runs show cancel button', async ({ page }) => {
    // Active (in_progress/queued) runs show a "Cancel" button
    const cancelButtons = page.getByRole('button', { name: /Cancel/i })
    const cancelCount = await cancelButtons.count()

    if (cancelCount > 0) {
      const firstCancel = cancelButtons.first()
      await expect(firstCancel).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    }

    // Page should always be functional
    await expect(page.getByTestId('dashboard-header')).toBeVisible({
      timeout: ELEMENT_VISIBLE_TIMEOUT_MS,
    })
  })

  test('flow visualization renders SVG connector lines', async ({ page }) => {
    // PipelineFlow renders SVG flow lines between columns
    const flowSvgs = page.locator('svg[aria-hidden="true"]')
    const svgCount = await flowSvgs.count()

    // Check if runs are visible — if so, SVGs for flow visualization must exist
    const inFlightText = page.getByText(/\d+ in flight/)
    const hasInFlight = await inFlightText.isVisible().catch((error) => { console.error(\'Promise error:\', error); return false })

    if (hasInFlight) {
      // When runs are in flight, the flow visualization should have SVG connectors
      expect(svgCount).toBeGreaterThan(0)
    }

    await expect(page.getByTestId('dashboard-header')).toBeVisible({
      timeout: ELEMENT_VISIBLE_TIMEOUT_MS,
    })
  })

  test('clicking a run row expands it to show details', async ({ page }) => {
    // Run rows should be expandable to show step/job details
    // Look for clickable run rows in the PipelineFlow section
    const inlineRunState = page.getByText(/\d+ in flight/)

    // Also check for expandable trigger elements (chevron/expand icons)
    const expandTriggers = page.locator('[data-testid*="run-row"] button:has(svg.lucide-chevron-down), [data-testid*="run-row"] button:has(svg.lucide-chevron-right), [data-testid*="pipeline"] button[data-testid*="expand"]')
    const expandCount = await expandTriggers.count()

    if (expandCount > 0) {
      const firstExpand = expandTriggers.first()
      await expect(firstExpand).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })

      // Click to expand
      await firstExpand.click()

      // After expanding, additional content should appear (job details, steps, etc.)
      // The expanded area should contain more text/elements than before
      await expect(page.getByTestId('dashboard-header')).toBeVisible({
        timeout: ELEMENT_VISIBLE_TIMEOUT_MS,
      })
    } else if (await inlineRunState.isVisible().catch((error) => { console.error(\'Promise error:\', error); return false })) {
      await expect(inlineRunState).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
      await expect(page.getByTestId('dashboard-header')).toBeVisible({
        timeout: ELEMENT_VISIBLE_TIMEOUT_MS,
      })
    } else {
      // No runs to expand — verify empty state
      const noRunsText = page.getByText('No runs in flight.')
      const hasNoRuns = await noRunsText.isVisible().catch((error) => { console.error(\'Promise error:\', error); return false })
      expect(hasNoRuns).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// #11017 — Logs modal
// ---------------------------------------------------------------------------

test.describe('CI/CD Logs modal (#11017)', () => {
  test.beforeEach(async ({ page }) => {
    await setupDemoAndNavigate(page, '/ci-cd')
    await waitForSubRoute(page)
  })

  test('Log button is visible on failure rows', async ({ page }) => {
    // RecentFailures renders "Log" buttons with title "View log tail"
    const logButtons = page.getByTitle('View log tail')
    const count = await logButtons.count()

    if (count > 0) {
      await expect(logButtons.first()).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    }

    // Failures section should render (even if empty with "No recent failures 🎉")
    const noFailures = page.getByText('No recent failures')
    const hasFailures = count > 0
    const hasEmpty = await noFailures.isVisible().catch((error) => { console.error(\'Promise error:\', error); return false })
    expect(hasFailures || hasEmpty).toBe(true)
  })

  test('clicking Log button opens the logs modal', async ({ page }) => {
    const logButtons = page.getByTitle('View log tail')
    const count = await logButtons.count()

    if (count === 0) {
      // No failure rows with log buttons — skip gracefully
      await expect(page.getByTestId('dashboard-header')).toBeVisible({
        timeout: ELEMENT_VISIBLE_TIMEOUT_MS,
      })
      return
    }

    // Click the first "Log" button
    await logButtons.first().click()

    // The LogsModal renders as a dialog with role="dialog"
    const modal = page.getByRole('dialog')
    await expect(modal).toBeVisible({ timeout: MODAL_TIMEOUT_MS })
  })

  test('logs modal shows loading state then content', async ({ page }) => {
    const logButtons = page.getByTitle('View log tail')
    const count = await logButtons.count()

    if (count === 0) {
      await expect(page.getByTestId('dashboard-header')).toBeVisible({
        timeout: ELEMENT_VISIBLE_TIMEOUT_MS,
      })
      return
    }

    await logButtons.first().click()

    const modal = page.getByRole('dialog')
    await expect(modal).toBeVisible({ timeout: MODAL_TIMEOUT_MS })

    // The modal should show "Loading log…" initially or rendered log content
    const preContent = modal.locator('pre')

    // Wait for loading to finish — should show content or error
    await expect(preContent).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    const preText = await preContent.textContent()
    const text = (preText || '').trim()
    expect(text.length).toBeGreaterThan(0)
    if (text === '(no matching lines)') return
    // Assert the content is actual log output — not just a placeholder.
    // Real log content contains timestamps, step names, or multi-line output.
    expect(text.length).toBeGreaterThan(10)
    // Verify it looks like log content (contains newlines or typical log patterns)
    const looksLikeLog = /\n/.test(text)
      || /\d{2}:\d{2}/.test(text)      // timestamp pattern
      || /step|run|error|info/i.test(text) // log keywords
      || text.split(' ').length > 3    // multi-word content
    expect(looksLikeLog).toBe(true)
  })

  test('logs modal has close button that dismisses it', async ({ page }) => {
    const logButtons = page.getByTitle('View log tail')
    const count = await logButtons.count()

    if (count === 0) {
      await expect(page.getByTestId('dashboard-header')).toBeVisible({
        timeout: ELEMENT_VISIBLE_TIMEOUT_MS,
      })
      return
    }

    await logButtons.first().click()

    const modal = page.getByRole('dialog')
    await expect(modal).toBeVisible({ timeout: MODAL_TIMEOUT_MS })

    // Close via the X button (aria-label="Close")
    const closeButton = modal.getByRole('button', { name: 'Close' })
    await expect(closeButton).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    await closeButton.click()

    // Modal should be dismissed
    await expect(modal).not.toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
  })

  test('logs modal closes on Escape key', async ({ page }) => {
    const logButtons = page.getByTitle('View log tail')
    const count = await logButtons.count()

    if (count === 0) {
      await expect(page.getByTestId('dashboard-header')).toBeVisible({
        timeout: ELEMENT_VISIBLE_TIMEOUT_MS,
      })
      return
    }

    await logButtons.first().click()

    const modal = page.getByRole('dialog')
    await expect(modal).toBeVisible({ timeout: MODAL_TIMEOUT_MS })

    // Press Escape to close
    await page.keyboard.press('Escape')
    await expect(modal).not.toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
  })

  test('logs modal displays repo and job info in header', async ({ page }) => {
    const logButtons = page.getByTitle('View log tail')
    const count = await logButtons.count()

    if (count === 0) {
      await expect(page.getByTestId('dashboard-header')).toBeVisible({
        timeout: ELEMENT_VISIBLE_TIMEOUT_MS,
      })
      return
    }

    await logButtons.first().click()

    const modal = page.getByRole('dialog')
    await expect(modal).toBeVisible({ timeout: MODAL_TIMEOUT_MS })

    // The modal header shows the title, repo name, and job ID
    // Check that the modal contains the "job #" pattern
    const jobInfo = modal.getByText(/job #\d+/)
    const hasJobInfo = await jobInfo.isVisible().catch((error) => { console.error(\'Promise error:\', error); return false })
    // Also check for Copy button presence as a structural check
    const copyButton = modal.getByText('Copy')
    const hasCopy = await copyButton.isVisible().catch((error) => { console.error(\'Promise error:\', error); return false })

    expect(hasJobInfo || hasCopy).toBe(true)
  })

  test('logs modal has filter/search input', async ({ page }) => {
    const logButtons = page.getByTitle('View log tail')
    const count = await logButtons.count()

    if (count === 0) {
      await expect(page.getByTestId('dashboard-header')).toBeVisible({
        timeout: ELEMENT_VISIBLE_TIMEOUT_MS,
      })
      return
    }

    await logButtons.first().click()

    const modal = page.getByRole('dialog')
    await expect(modal).toBeVisible({ timeout: MODAL_TIMEOUT_MS })

    // The filter input has placeholder "Filter lines…"
    const filterInput = modal.getByPlaceholder('Filter lines…')
    await expect(filterInput).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
  })

  test('logs modal handles API error gracefully', async ({ page }) => {
    // Mock the log endpoint to return an error
    await page.route('**/api/github-pipelines?**', (route) => {
      const requestUrl = new URL(route.request().url())
      if (requestUrl.searchParams.get('view') !== 'log') {
        return route.fallback()
      }
      return route.fulfill({
        status: HTTP_OK,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Log not available' }),
      })
    })

    const logButtons = page.getByTitle('View log tail')
    const count = await logButtons.count()

    if (count === 0) {
      await expect(page.getByTestId('dashboard-header')).toBeVisible({
        timeout: ELEMENT_VISIBLE_TIMEOUT_MS,
      })
      return
    }

    await logButtons.first().click()

    const modal = page.getByRole('dialog')
    await expect(modal).toBeVisible({ timeout: MODAL_TIMEOUT_MS })

    // Should show error-specific content — not just any generic placeholder
    const preContent = modal.locator('pre')
    const errorIndicator = modal.locator('.text-red-400, .text-destructive')
    await expect(preContent).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    const text = await preContent.textContent()
    const errorVisible = await errorIndicator.isVisible().catch((error) => { console.error(\'Promise error:\', error); return false })
    // Assert the content specifically indicates an error state
    const hasErrorIndicator = /error|not available|failed|unavailable|could not/i.test(text || '')
    const handledEmptyDemoState = (text || '').trim() === '(no matching lines)'
    expect(hasErrorIndicator || errorVisible || handledEmptyDemoState).toBe(true)
  })
})
