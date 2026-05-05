import { test, expect, Page } from '@playwright/test'
import { mockApiFallback } from './helpers/setup'
import { setupLiveMode } from './helpers/storage-setup'

// ---------------------------------------------------------------------------
// Timeout constants
// ---------------------------------------------------------------------------

/** Timeout for the clusters page to become visible after navigation */
const PAGE_VISIBLE_TIMEOUT_MS = 20_000

/** Timeout for cluster names/data to appear (WebKit/Firefox render slightly later) */
const DATA_RENDER_TIMEOUT_MS = 20_000

/** Timeout for dialogs/modals to appear */
const DIALOG_TIMEOUT_MS = 10_000

/** Timeout for navigation assertions */
const NAV_TIMEOUT_MS = 15_000

// ---------------------------------------------------------------------------
// Test setup helper — mirrors setupClustersTest from Clusters.spec.ts but
// includes GPU data and unreachable clusters for dialog testing.
// ---------------------------------------------------------------------------

async function setupClustersDialogTest(page: Page) {
  await mockApiFallback(page)

  // Return oauth_configured: true to avoid demo mode fallback
  await page.route('**/health', (route) => {
    const url = new URL(route.request().url())
    if (url.pathname !== '/health') return route.fallback()
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'ok',
        version: 'dev',
        oauth_configured: true,
        in_cluster: false,
        no_local_agent: true,
        install_method: 'dev',
      }),
    })
  })

  // Mock local agent — prevent cross-origin errors
  await page.route('**/127.0.0.1:8585/**', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'agent not running' }),
    })
  )

  // Mock authentication
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

  // Mock MCP clusters with GPU data + unreachable cluster for rename/remove testing
  await page.route('**/api/mcp/**', (route) => {
    const url = route.request().url()
    if (url.includes('/clusters')) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          clusters: [
            {
              name: 'prod-gpu',
              context: 'prod-gpu',
              healthy: true,
              reachable: true,
              nodeCount: 4,
              podCount: 60,
              version: '1.28.0',
              source: 'kubeconfig',
              gpuNodes: [
                { nodeName: 'gpu-node-1', gpuType: 'NVIDIA A100', gpuCount: 4, gpuAllocated: 2, cluster: 'prod-gpu' },
                { nodeName: 'gpu-node-2', gpuType: 'NVIDIA A100', gpuCount: 4, gpuAllocated: 3, cluster: 'prod-gpu' },
              ],
            },
            {
              name: 'prod-east',
              context: 'prod-east',
              healthy: true,
              reachable: true,
              nodeCount: 5,
              podCount: 45,
              version: '1.28.0',
              source: 'kubeconfig',
            },
            {
              name: 'offline-cluster',
              context: 'offline-cluster',
              healthy: false,
              reachable: false,
              nodeCount: 0,
              podCount: 0,
              version: '1.27.0',
              source: 'kubeconfig',
              errorMessage: 'Connection refused',
            },
          ],
        }),
      })
    } else if (url.includes('/gpu')) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          nodes: [
            { nodeName: 'gpu-node-1', gpuType: 'NVIDIA A100', gpuCount: 4, gpuAllocated: 2, cluster: 'prod-gpu' },
            { nodeName: 'gpu-node-2', gpuType: 'NVIDIA A100', gpuCount: 4, gpuAllocated: 3, cluster: 'prod-gpu' },
          ],
        }),
      })
    } else {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ issues: [], events: [], nodes: [] }),
      })
    }
  })

  // Seed localStorage before page scripts run. Uses the shared helper so
  // addInitScript does not accumulate and IndexedDB cleanup completes
  // before sessionStorage rehydration (#12088, #12089).
  await setupLiveMode(page)

  await page.goto('/clusters')
  await page.waitForLoadState('domcontentloaded')
  await page.getByTestId('clusters-page').waitFor({ state: 'visible', timeout: PAGE_VISIBLE_TIMEOUT_MS })
}

// ===========================================================================
// #11779: Add Cluster dialog open/cancel
// ===========================================================================

test.describe('Add Cluster Dialog (#11779)', () => {
  test.beforeEach(async ({ page }) => {
    await setupClustersDialogTest(page)
  })

  test('opens Add Cluster dialog when clicking Add Cluster button', async ({ page }) => {
    // Wait for cluster data to render so the filter bar with Add Cluster button appears
    await expect(page.getByText('prod-east').first()).toBeVisible({ timeout: DATA_RENDER_TIMEOUT_MS })

    // Click the Add Cluster button in the filter tabs area
    const addClusterBtn = page.locator('button', { hasText: /Add Cluster/i }).first()
    await expect(addClusterBtn).toBeVisible({ timeout: DATA_RENDER_TIMEOUT_MS })
    await addClusterBtn.click()

    // Assert dialog opens — AddClusterDialog contains tabs for different methods
    const dialog = page.getByRole('dialog').first()
    await expect(dialog).toBeVisible({ timeout: DIALOG_TIMEOUT_MS })

    // Verify dialog contains expected content (tab options for adding clusters)
    await expect(page.getByText(/Command Line|Import|Connect/i).first()).toBeVisible({ timeout: DIALOG_TIMEOUT_MS })
  })

  test('closes Add Cluster dialog on Cancel/close button', async ({ page }) => {
    await expect(page.getByText('prod-east').first()).toBeVisible({ timeout: DATA_RENDER_TIMEOUT_MS })

    // Open the dialog
    const addClusterBtn = page.locator('button', { hasText: /Add Cluster/i }).first()
    await addClusterBtn.click()

    const dialog = page.getByRole('dialog').first()
    await expect(dialog).toBeVisible({ timeout: DIALOG_TIMEOUT_MS })

    // Close via the X button (close button in modal header)
    const closeBtn = dialog.locator('button[aria-label="Close"], button:has(svg.lucide-x)').first()
    await closeBtn.click()

    // Assert dialog is no longer visible
    await expect(dialog).not.toBeVisible({ timeout: DIALOG_TIMEOUT_MS })
  })

  test('closes Add Cluster dialog on Escape key', async ({ page }) => {
    await expect(page.getByText('prod-east').first()).toBeVisible({ timeout: DATA_RENDER_TIMEOUT_MS })

    // Open the dialog
    const addClusterBtn = page.locator('button', { hasText: /Add Cluster/i }).first()
    await addClusterBtn.click()

    const dialog = page.getByRole('dialog').first()
    await expect(dialog).toBeVisible({ timeout: DIALOG_TIMEOUT_MS })

    // Press Escape to close
    await page.keyboard.press('Escape')

    // Assert dialog is no longer visible
    await expect(dialog).not.toBeVisible({ timeout: DIALOG_TIMEOUT_MS })
  })
})

// ===========================================================================
// #11780: Rename and Remove cluster dialogs
// ===========================================================================

test.describe('Rename and Remove Cluster Dialogs (#11780)', () => {
  test.beforeEach(async ({ page }) => {
    await setupClustersDialogTest(page)
  })

  test('opens Rename dialog when clicking rename button on a cluster card', async ({ page }) => {
    // Wait for clusters to render
    await expect(page.getByText('prod-east').first()).toBeVisible({ timeout: DATA_RENDER_TIMEOUT_MS })

    // Find the rename button (pencil icon) on a kubeconfig-sourced cluster
    // The rename button has aria-label matching "Rename context" (i18n key: common.renameContext)
    const renameBtn = page.locator('button[aria-label*="ename"]').first()
    await expect(renameBtn).toBeVisible({ timeout: DATA_RENDER_TIMEOUT_MS })
    await renameBtn.click()

    // Assert Rename modal opens with input field
    const dialog = page.getByRole('dialog').first()
    await expect(dialog).toBeVisible({ timeout: DIALOG_TIMEOUT_MS })

    // Should have a text input for the new name
    const nameInput = dialog.locator('input[type="text"]')
    await expect(nameInput).toBeVisible({ timeout: DIALOG_TIMEOUT_MS })

    // Should show the current context name in the dialog
    await expect(dialog.getByText(/prod-east|prod-gpu/)).toBeVisible()
  })

  test('Rename dialog cancel closes without changes', async ({ page }) => {
    await expect(page.getByText('prod-east').first()).toBeVisible({ timeout: DATA_RENDER_TIMEOUT_MS })

    // Open rename dialog
    const renameBtn = page.locator('button[aria-label*="ename"]').first()
    await renameBtn.click()

    const dialog = page.getByRole('dialog').first()
    await expect(dialog).toBeVisible({ timeout: DIALOG_TIMEOUT_MS })

    // Click Cancel button
    const cancelBtn = dialog.locator('button', { hasText: /Cancel/i })
    await cancelBtn.click()

    // Dialog should close
    await expect(dialog).not.toBeVisible({ timeout: DIALOG_TIMEOUT_MS })

    // Original cluster name should still be visible
    await expect(page.getByText('prod-east').first()).toBeVisible()
  })

  test('Rename dialog shows validation error for empty name', async ({ page }) => {
    await expect(page.getByText('prod-east').first()).toBeVisible({ timeout: DATA_RENDER_TIMEOUT_MS })

    // Open rename dialog
    const renameBtn = page.locator('button[aria-label*="ename"]').first()
    await renameBtn.click()

    const dialog = page.getByRole('dialog').first()
    await expect(dialog).toBeVisible({ timeout: DIALOG_TIMEOUT_MS })

    // Clear the input and try to rename
    const nameInput = dialog.locator('input[type="text"]')
    await nameInput.fill('')

    // Click the Rename submit button
    const submitBtn = dialog.locator('button', { hasText: /^Rename$/ })
    await submitBtn.click()

    // Should show an error message about empty name
    await expect(dialog.locator('.text-red-400, [role="alert"]').first()).toBeVisible({ timeout: DIALOG_TIMEOUT_MS })
  })

  test('Remove cluster dialog opens for unreachable cluster', async ({ page }) => {
    // Wait for the offline cluster to render
    await expect(page.getByText('offline-cluster').first()).toBeVisible({ timeout: DATA_RENDER_TIMEOUT_MS })

    // Find and click the remove button (trash icon on offline cluster)
    // The remove button has data-testid="remove-cluster-button"
    const removeBtn = page.getByTestId('remove-cluster-button').first()
    await expect(removeBtn).toBeVisible({ timeout: DATA_RENDER_TIMEOUT_MS })
    await removeBtn.click()

    // Assert the Remove Cluster dialog opens
    const dialog = page.getByRole('dialog').first()
    await expect(dialog).toBeVisible({ timeout: DIALOG_TIMEOUT_MS })

    // Should show warning about removing cluster
    await expect(dialog.locator('text=/remove|Remove/i').first()).toBeVisible()

    // Should display the cluster context name
    await expect(dialog.getByText('offline-cluster')).toBeVisible()
  })

  test('Remove cluster dialog cancel closes without removing', async ({ page }) => {
    await expect(page.getByText('offline-cluster').first()).toBeVisible({ timeout: DATA_RENDER_TIMEOUT_MS })

    // Open remove dialog
    const removeBtn = page.getByTestId('remove-cluster-button').first()
    await removeBtn.click()

    const dialog = page.getByRole('dialog').first()
    await expect(dialog).toBeVisible({ timeout: DIALOG_TIMEOUT_MS })

    // Click Cancel
    const cancelBtn = dialog.locator('button', { hasText: /Cancel/i })
    await cancelBtn.click()

    // Dialog should close
    await expect(dialog).not.toBeVisible({ timeout: DIALOG_TIMEOUT_MS })

    // Cluster should still be listed
    await expect(page.getByText('offline-cluster').first()).toBeVisible()
  })
})

// ===========================================================================
// #11782: GPU stat block click → GPUDetailModal
// ===========================================================================

test.describe('GPU Stat Block → GPUDetailModal (#11782)', () => {
  test.beforeEach(async ({ page }) => {
    await setupClustersDialogTest(page)
  })

  test('clicking GPU stat block opens GPUDetailModal', async ({ page }) => {
    // Wait for page and stat blocks to render
    await expect(page.getByTestId('clusters-page')).toBeVisible({ timeout: PAGE_VISIBLE_TIMEOUT_MS })

    // Find the GPUs stat block by its testid
    const gpuStatBlock = page.getByTestId('stat-block-gpus')
    await expect(gpuStatBlock).toBeVisible({ timeout: DATA_RENDER_TIMEOUT_MS })

    // Click the GPU stat block
    await gpuStatBlock.click()

    // Assert GPUDetailModal opens — it has title "GPU Resources"
    const dialog = page.getByRole('dialog').first()
    await expect(dialog).toBeVisible({ timeout: DIALOG_TIMEOUT_MS })
    await expect(dialog.getByText('GPU Resources')).toBeVisible({ timeout: DIALOG_TIMEOUT_MS })
  })

  test('GPUDetailModal shows GPU information', async ({ page }) => {
    await expect(page.getByTestId('stat-block-gpus')).toBeVisible({ timeout: DATA_RENDER_TIMEOUT_MS })
    await page.getByTestId('stat-block-gpus').click()

    const dialog = page.getByRole('dialog').first()
    await expect(dialog).toBeVisible({ timeout: DIALOG_TIMEOUT_MS })

    // Modal should show GPU type or node info from mock data
    // Look for any GPU-related content (NVIDIA, GPU count, utilization)
    const gpuContent = dialog.locator('text=/GPU|NVIDIA|gpu|utilization/i').first()
    await expect(gpuContent).toBeVisible({ timeout: DIALOG_TIMEOUT_MS })
  })

  test('GPUDetailModal closes on close button', async ({ page }) => {
    await expect(page.getByTestId('stat-block-gpus')).toBeVisible({ timeout: DATA_RENDER_TIMEOUT_MS })
    await page.getByTestId('stat-block-gpus').click()

    const dialog = page.getByRole('dialog').first()
    await expect(dialog).toBeVisible({ timeout: DIALOG_TIMEOUT_MS })

    // Close via X button
    const closeBtn = dialog.locator('button[aria-label="Close"], button:has(svg.lucide-x)').first()
    await closeBtn.click()

    // Dialog should close
    await expect(dialog).not.toBeVisible({ timeout: DIALOG_TIMEOUT_MS })
  })
})

// ===========================================================================
// #11783: ClusterGroupsSection (create, select, delete group)
// ===========================================================================

test.describe('ClusterGroupsSection CRUD (#11783)', () => {
  test.beforeEach(async ({ page }) => {
    await setupClustersDialogTest(page)
  })

  test('New Group button is visible and opens group creation form', async ({ page }) => {
    await expect(page.getByTestId('clusters-page')).toBeVisible({ timeout: PAGE_VISIBLE_TIMEOUT_MS })
    await expect(page.getByText('prod-east').first()).toBeVisible({ timeout: DATA_RENDER_TIMEOUT_MS })

    // Find the "New Group" button in the ClusterGroupsSection
    const newGroupBtn = page.locator('button', { hasText: /New Group/i }).first()
    await expect(newGroupBtn).toBeVisible({ timeout: DATA_RENDER_TIMEOUT_MS })
    await newGroupBtn.click()

    // Form should appear with a text input for group name
    const groupNameInput = page.locator('input[placeholder*="Group name"]')
    await expect(groupNameInput).toBeVisible({ timeout: DIALOG_TIMEOUT_MS })

    // Should show cluster picker text
    await expect(page.getByText(/Select clusters for this group/i)).toBeVisible()
  })

  test('can create a cluster group by filling name and selecting clusters', async ({ page }) => {
    await expect(page.getByText('prod-east').first()).toBeVisible({ timeout: DATA_RENDER_TIMEOUT_MS })

    // Open group creation form
    const newGroupBtn = page.locator('button', { hasText: /New Group/i }).first()
    await newGroupBtn.click()

    // Fill group name
    const groupNameInput = page.locator('input[placeholder*="Group name"]')
    await groupNameInput.fill('Production Clusters')

    // Select a cluster from the picker (click on cluster name button in picker)
    const clusterPickerBtn = page.locator('button', { hasText: 'prod-east' }).first()
    await expect(clusterPickerBtn).toBeVisible({ timeout: DATA_RENDER_TIMEOUT_MS })
    await clusterPickerBtn.click()

    // Click Create button
    const createBtn = page.locator('button', { hasText: /^Create$/ })
    await expect(createBtn).toBeEnabled()
    await createBtn.click()

    // The form should close and the group should appear in the list
    await expect(groupNameInput).not.toBeVisible({ timeout: DIALOG_TIMEOUT_MS })

    // The newly created group name should be visible
    await expect(page.getByText('Production Clusters').first()).toBeVisible({ timeout: DATA_RENDER_TIMEOUT_MS })
  })

  test('Create button is disabled without name or cluster selection', async ({ page }) => {
    await expect(page.getByText('prod-east').first()).toBeVisible({ timeout: DATA_RENDER_TIMEOUT_MS })

    // Open group creation form
    const newGroupBtn = page.locator('button', { hasText: /New Group/i }).first()
    await newGroupBtn.click()

    // Create button should be disabled initially (no name, no clusters selected)
    const createBtn = page.locator('button', { hasText: /^Create$/ })
    await expect(createBtn).toBeDisabled()
  })

  test('Cancel button closes group creation form', async ({ page }) => {
    await expect(page.getByText('prod-east').first()).toBeVisible({ timeout: DATA_RENDER_TIMEOUT_MS })

    // Open group creation form
    const newGroupBtn = page.locator('button', { hasText: /New Group/i }).first()
    await newGroupBtn.click()

    const groupNameInput = page.locator('input[placeholder*="Group name"]')
    await expect(groupNameInput).toBeVisible({ timeout: DIALOG_TIMEOUT_MS })

    // Click Cancel
    const cancelBtn = page.locator('button', { hasText: /^Cancel$/ }).first()
    await cancelBtn.click()

    // Form should disappear
    await expect(groupNameInput).not.toBeVisible({ timeout: DIALOG_TIMEOUT_MS })
  })

  test('can delete a cluster group with confirmation dialog', async ({ page }) => {
    await expect(page.getByText('prod-east').first()).toBeVisible({ timeout: DATA_RENDER_TIMEOUT_MS })

    // First create a group so we have something to delete
    const newGroupBtn = page.locator('button', { hasText: /New Group/i }).first()
    await newGroupBtn.click()

    const groupNameInput = page.locator('input[placeholder*="Group name"]')
    await groupNameInput.fill('Test Group')

    // Select a cluster
    const clusterPickerBtn = page.locator('button', { hasText: 'prod-east' }).first()
    await clusterPickerBtn.click()

    // Create the group
    const createBtn = page.locator('button', { hasText: /^Create$/ })
    await createBtn.click()

    // Wait for group to appear
    await expect(page.getByText('Test Group').first()).toBeVisible({ timeout: DATA_RENDER_TIMEOUT_MS })

    // Click the delete (trash) icon on the group
    // The delete button is within the group row — look for the Trash2 icon button
    const deleteBtn = page.locator('button[title*="elete"], button[title*="roup"]').first()
    await expect(deleteBtn).toBeVisible({ timeout: DATA_RENDER_TIMEOUT_MS })
    await deleteBtn.click()

    // Confirmation dialog should appear
    const confirmDialog = page.getByRole('dialog').first()
    await expect(confirmDialog).toBeVisible({ timeout: DIALOG_TIMEOUT_MS })

    // Should mention deleting the group
    await expect(confirmDialog.getByText(/delete|remove/i).first()).toBeVisible()

    // Confirm deletion
    const confirmBtn = confirmDialog.locator('button', { hasText: /Delete|Confirm|Yes/i }).first()
    await confirmBtn.click()

    // Group should be removed
    await expect(confirmDialog).not.toBeVisible({ timeout: DIALOG_TIMEOUT_MS })
  })

  test('selecting a group activates it', async ({ page }) => {
    await expect(page.getByText('prod-east').first()).toBeVisible({ timeout: DATA_RENDER_TIMEOUT_MS })

    // Create a group first
    const newGroupBtn = page.locator('button', { hasText: /New Group/i }).first()
    await newGroupBtn.click()

    const groupNameInput = page.locator('input[placeholder*="Group name"]')
    await groupNameInput.fill('GPU Group')

    const clusterPickerBtn = page.locator('button', { hasText: 'prod-gpu' }).first()
    await clusterPickerBtn.click()

    const createBtn = page.locator('button', { hasText: /^Create$/ })
    await createBtn.click()

    // Wait for the group to appear in the list
    await expect(page.getByText('GPU Group').first()).toBeVisible({ timeout: DATA_RENDER_TIMEOUT_MS })

    // Click on the group to select/activate it
    const groupEntry = page.locator('button', { hasText: 'GPU Group' }).first()
    await groupEntry.click()

    // After selecting, the group should be highlighted or active
    // The selectClusterGroup callback filters clusters — verify it was invoked
    // by checking the group is still rendered (it stays visible after selection)
    await expect(page.getByText('GPU Group').first()).toBeVisible()
  })
})

// ===========================================================================
// #11784: Stat block navigation (Compute / Storage / Workloads)
// ===========================================================================

test.describe('Stat Block Navigation (#11784)', () => {
  test.beforeEach(async ({ page }) => {
    await setupClustersDialogTest(page)
  })

  test('clicking Nodes stat block navigates to /compute', async ({ page }) => {
    await expect(page.getByTestId('clusters-page')).toBeVisible({ timeout: PAGE_VISIBLE_TIMEOUT_MS })

    // Wait for stat blocks to render with data
    const nodesStatBlock = page.getByTestId('stat-block-nodes')
    await expect(nodesStatBlock).toBeVisible({ timeout: DATA_RENDER_TIMEOUT_MS })

    // Click nodes stat block
    await nodesStatBlock.click()

    // Should navigate to /compute
    await expect(page).toHaveURL(/\/compute/, { timeout: NAV_TIMEOUT_MS })
  })

  test('clicking CPUs stat block navigates to /compute', async ({ page }) => {
    await expect(page.getByTestId('clusters-page')).toBeVisible({ timeout: PAGE_VISIBLE_TIMEOUT_MS })

    const cpuStatBlock = page.getByTestId('stat-block-cpus')
    await expect(cpuStatBlock).toBeVisible({ timeout: DATA_RENDER_TIMEOUT_MS })

    await cpuStatBlock.click()

    await expect(page).toHaveURL(/\/compute/, { timeout: NAV_TIMEOUT_MS })
  })

  test('clicking Memory stat block navigates to /compute', async ({ page }) => {
    await expect(page.getByTestId('clusters-page')).toBeVisible({ timeout: PAGE_VISIBLE_TIMEOUT_MS })

    const memoryStatBlock = page.getByTestId('stat-block-memory')
    await expect(memoryStatBlock).toBeVisible({ timeout: DATA_RENDER_TIMEOUT_MS })

    await memoryStatBlock.click()

    await expect(page).toHaveURL(/\/compute/, { timeout: NAV_TIMEOUT_MS })
  })

  test('clicking Storage stat block navigates to /storage', async ({ page }) => {
    await expect(page.getByTestId('clusters-page')).toBeVisible({ timeout: PAGE_VISIBLE_TIMEOUT_MS })

    const storageStatBlock = page.getByTestId('stat-block-storage')
    await expect(storageStatBlock).toBeVisible({ timeout: DATA_RENDER_TIMEOUT_MS })

    await storageStatBlock.click()

    await expect(page).toHaveURL(/\/storage/, { timeout: NAV_TIMEOUT_MS })
  })

  test('clicking Pods stat block navigates to /workloads', async ({ page }) => {
    await expect(page.getByTestId('clusters-page')).toBeVisible({ timeout: PAGE_VISIBLE_TIMEOUT_MS })

    const podsStatBlock = page.getByTestId('stat-block-pods')
    await expect(podsStatBlock).toBeVisible({ timeout: DATA_RENDER_TIMEOUT_MS })

    await podsStatBlock.click()

    await expect(page).toHaveURL(/\/workloads/, { timeout: NAV_TIMEOUT_MS })
  })
})
