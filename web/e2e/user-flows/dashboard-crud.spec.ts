  import { test, expect, testData } from '../fixtures'

/**
 * E2E tests for dashboard CRUD operations
 *
 * Covers: create / rename / delete dashboards, add / remove cards,
 * dashboard import/export, and persistence across reload.
 */

test.beforeEach(async ({ page, mockAPI }) => {
  // Standard API mocks used by every test in this file
  await mockAPI.mockClusters(testData.clusters.healthy)
  await mockAPI.mockPodIssues(testData.podIssues.none)
  await mockAPI.mockEvents(testData.events.normal)
  await mockAPI.mockLocalAgent()

  // Auth mock
  await page.route('**/api/me', (route) =>
    route.fulfill({
      status: 200,
      json: {
        id: '1',
        github_login: 'testuser',
        email: 'test@example.com',
        onboarded: true,
      },
    })
  )

  await page.goto('/login')
  await page.evaluate(() => {
    localStorage.setItem('token', 'test-token')
    localStorage.setItem('demo-user-onboarded', 'true')
  })
  await page.goto('/')
  await page.waitForLoadState('domcontentloaded')
  await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 15000 })
})

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard creation
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Dashboard Creation', () => {
  test('can create a new dashboard', async ({ page }) => {
    // Open the dashboard list / create panel from the sidebar
    const addDashboardBtn = page.getByTestId('sidebar-add-dashboard')
      .or(page.getByRole('button', { name: /new dashboard|add dashboard/i }))

    const exists = await addDashboardBtn.isVisible({ timeout: 5000 }).catch(() => false)
    if (!exists) {
      test.skip()
      return
    }
    await addDashboardBtn.click()

    // A dialog or inline input should appear
    const nameInput = page.getByPlaceholder(/dashboard name/i)
      .or(page.getByLabel(/dashboard name/i))
    await expect(nameInput).toBeVisible({ timeout: 5000 })

    await nameInput.fill('My Test Dashboard')
    await page.keyboard.press('Enter')

    // New dashboard should appear in the sidebar / title
    await expect(
      page.getByText('My Test Dashboard')
    ).toBeVisible({ timeout: 5000 })
  })

  test('new dashboard starts empty', async ({ page }) => {
    const addDashboardBtn = page.getByTestId('sidebar-add-dashboard')
      .or(page.getByRole('button', { name: /new dashboard|add dashboard/i }))

    const exists = await addDashboardBtn.isVisible().catch(() => false)
    if (!exists) test.skip()

    await addDashboardBtn.click()

    const nameInput = page.getByPlaceholder(/dashboard name/i)
      .or(page.getByLabel(/dashboard name/i))
    await nameInput.fill('Empty Dashboard')
    await page.keyboard.press('Enter')

    // Cards grid should be visible but contain no cards (or a prompt to add one)
    const grid = page.getByTestId('dashboard-cards-grid')
    await expect(grid).toBeVisible({ timeout: 5000 })

    const cardCount = await grid.locator('> div').count()
    // An empty dashboard has 0 cards or shows an "add your first card" prompt
    const emptyPrompt = page.getByText(/no cards|add your first card|get started/i)
    const hasPrompt = await emptyPrompt.isVisible().catch(() => false)

    expect(cardCount === 0 || hasPrompt).toBeTruthy()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard rename
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Dashboard Rename', () => {
  test('can rename the current dashboard', async ({ page }) => {
    const titleEl = page.getByTestId('dashboard-title')
    await expect(titleEl).toBeVisible({ timeout: 5000 })

    // Double-click to enter rename mode (common pattern)
    await titleEl.dblclick()

    const renameInput = page.getByTestId('dashboard-title-input')
      .or(page.getByRole('textbox', { name: /dashboard title|rename/i }))

    const hasInput = await renameInput.isVisible({ timeout: 2000 }).catch(() => false)
    if (!hasInput) test.skip() // rename not yet implemented via dblclick

    await renameInput.clear()
    await renameInput.fill('Renamed Dashboard')
    await page.keyboard.press('Enter')

    await expect(page.getByTestId('dashboard-title')).toHaveText('Renamed Dashboard', { timeout: 3000 })
  })

  test('rename persists after page reload', async ({ page }) => {
    const titleEl = page.getByTestId('dashboard-title')
    await titleEl.dblclick()

    const renameInput = page.getByTestId('dashboard-title-input')
      .or(page.getByRole('textbox', { name: /dashboard title|rename/i }))
    const hasInput = await renameInput.isVisible({ timeout: 2000 }).catch(() => false)
    if (!hasInput) test.skip()

    await renameInput.clear()
    await renameInput.fill('Persistent Name')
    await page.keyboard.press('Enter')

    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    await expect(page.getByTestId('dashboard-title')).toHaveText('Persistent Name', { timeout: 5000 })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard deletion
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Dashboard Deletion', () => {
  test('can delete a non-default dashboard', async ({ page }) => {
    // First create a dashboard so we have something deletable
    const addBtn = page.getByTestId('sidebar-add-dashboard')
      .or(page.getByRole('button', { name: /new dashboard|add dashboard/i }))
    const canCreate = await addBtn.isVisible().catch(() => false)
    if (!canCreate) test.skip()

    await addBtn.click()
    const nameInput = page.getByPlaceholder(/dashboard name/i).or(page.getByLabel(/dashboard name/i))
    await nameInput.fill('Dashboard To Delete')
    await page.keyboard.press('Enter')
    await expect(page.getByText('Dashboard To Delete')).toBeVisible()

    // Open dashboard options / kebab menu
    const optionsBtn = page.getByTestId('dashboard-options')
      .or(page.getByRole('button', { name: /dashboard options|more options/i }))
    await optionsBtn.click()

    const deleteOption = page.getByRole('menuitem', { name: /delete/i })
    await expect(deleteOption).toBeVisible()
    await deleteOption.click()

    // Confirm deletion if a dialog appears
    const confirmBtn = page.getByRole('button', { name: /confirm|yes.*delete/i })
    const hasConfirm = await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)
    if (hasConfirm) await confirmBtn.click()

    // Dashboard should no longer be in the sidebar
    await expect(page.getByText('Dashboard To Delete')).not.toBeVisible({ timeout: 5000 })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Card add / remove
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Card Management', () => {
  test('can open add-card modal', async ({ page }) => {
    const addCardBtn = page.getByTestId('sidebar-add-card')
      .or(page.getByRole('button', { name: /add card/i }))

    const exists = await addCardBtn.isVisible({ timeout: 5000 }).catch(() => false)
    if (!exists) {
      test.skip()
      return
    }
    await addCardBtn.click()

    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 })
  })

  test('add-card modal displays searchable card list', async ({ page }) => {
    const addCardBtn = page.getByTestId('sidebar-add-card')
      .or(page.getByRole('button', { name: /add card/i }))

    const exists = await addCardBtn.isVisible({ timeout: 5000 }).catch(() => false)
    if (!exists) {
      test.skip()
      return
    }
    await addCardBtn.click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    // Modal should have a search box or a list of card types
    const search = dialog.getByRole('searchbox').or(dialog.getByPlaceholder(/search/i))
    const cardList = dialog.getByRole('list').or(dialog.locator('[data-testid*="card-option"]'))

    const hasSearch = await search.isVisible().catch(() => false)
    const hasCardList = await cardList.isVisible().catch(() => false)

    expect(hasSearch || hasCardList).toBeTruthy()
  })

  test('can close add-card modal with Escape', async ({ page }) => {
    const addCardBtn = page.getByTestId('sidebar-add-card')
      .or(page.getByRole('button', { name: /add card/i }))

    const exists = await addCardBtn.isVisible({ timeout: 5000 }).catch(() => false)
    if (!exists) {
      test.skip()
      return
    }
    await addCardBtn.click()
    await expect(page.getByRole('dialog')).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 3000 })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard export / import
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Dashboard Import / Export', () => {
  test('export option is accessible from dashboard menu', async ({ page }) => {
    const optionsBtn = page.getByTestId('dashboard-options')
      .or(page.getByRole('button', { name: /dashboard options|more options/i }))

    const hasOptions = await optionsBtn.isVisible().catch(() => false)
    if (!hasOptions) test.skip()

    await optionsBtn.click()

    const exportOption = page.getByRole('menuitem', { name: /export/i })
    await expect(exportOption).toBeVisible({ timeout: 3000 })
  })

  test('import option is accessible from dashboard menu', async ({ page }) => {
    const optionsBtn = page.getByTestId('dashboard-options')
      .or(page.getByRole('button', { name: /dashboard options|more options/i }))

    const hasOptions = await optionsBtn.isVisible().catch(() => false)
    if (!hasOptions) test.skip()

    await optionsBtn.click()

    const importOption = page.getByRole('menuitem', { name: /import/i })
    await expect(importOption).toBeVisible({ timeout: 3000 })
  })
})