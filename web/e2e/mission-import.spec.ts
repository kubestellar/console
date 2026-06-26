import { test, expect, Page } from '@playwright/test'

const UI_TIMEOUT_MS = 10_000
const LOCAL_AGENT_URL = 'http://127.0.0.1:8585/'

const COMMUNITY_ENTRIES = [
  { name: 'troubleshoot', path: 'fixes/troubleshoot', type: 'directory' },
  { name: 'deploy', path: 'fixes/deploy', type: 'directory' },
]

const VALID_MISSION_JSON = JSON.stringify({
  version: 'kc-mission-v1',
  title: 'Imported Test Mission',
  description: 'A test mission for import validation',
  type: 'custom',
  tags: ['import'],
  steps: [
    {
      title: 'Check pod status',
      description: 'Inspect the current pod status before taking action.',
      command: 'kubectl get pods -n default',
    },
  ],
  metadata: { author: 'testuser', createdAt: new Date().toISOString() },
})

const INVALID_JSON = '{ this is not valid json !!!'

const MALICIOUS_MISSION_JSON = JSON.stringify({
  version: 'kc-mission-v1',
  title: '<script>alert("xss")</script>',
  description: 'javascript:alert(document.cookie)',
  type: 'custom',
  tags: ['security'],
  steps: [
    {
      title: 'Inspect payload',
      description: '<img src=x onerror=alert(1)>',
      command: 'echo "<script>alert(1)</script>"',
    },
  ],
  metadata: { author: '<svg onload=alert(1)>', createdAt: new Date().toISOString() },
})

async function setupMissionImportTest(page: Page) {
  await page.route('**/api/me', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: '1',
        github_id: '12345',
        github_login: 'testuser',
        email: 'test@example.com',
        onboarded: true,
        role: 'admin',
      }),
    })
  )

  for (const pattern of ['**/api/health', '**/health']) {
    await page.route(pattern, route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ok', oauth_configured: false, in_cluster: false, install_method: 'dev' }),
      })
    )
  }

  await page.route('**/api/github/token/status', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ hasToken: true, source: 'env' }) })
  )

  await page.route('**/api/mcp/**', route => {
    const url = route.request().url()
    if (url.includes('/clusters')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ clusters: [{ name: 'prod-cluster', context: 'prod-cluster', healthy: true, nodeCount: 3, podCount: 20 }] }),
      })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ issues: [], events: [], nodes: [], pods: [] }) })
  })

  await page.route('**/api/missions/browse**', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(COMMUNITY_ENTRIES),
    })
  )

  await page.route(`${LOCAL_AGENT_URL}**`, route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ events: [], health: { hasClaude: true, hasBob: false } }),
    })
  )

  await page.addInitScript(() => {
    localStorage.setItem('token', 'demo-token')
    localStorage.setItem('kc-demo-mode', 'true')
    localStorage.setItem('demo-user-onboarded', 'true')
    localStorage.setItem('kc-agent-setup-dismissed', 'true')
    localStorage.setItem('kc-backend-status', JSON.stringify({ available: true, timestamp: Date.now() }))
  })

  await page.goto('/?browse=missions')
  await page.waitForLoadState('domcontentloaded')
  await expect(page.getByTestId('mission-browser')).toBeVisible({ timeout: UI_TIMEOUT_MS })
}

function getMissionBrowser(page: Page) {
  return page.getByTestId('mission-browser')
}

function getMissionTree(page: Page) {
  return page.getByTestId('mission-tree')
}

async function uploadMissionFile(page: Page, name: string, payload: string) {
  await page.locator('input[type="file"]').first().setInputFiles({
    name,
    mimeType: 'application/json',
    buffer: Buffer.from(payload),
  })
}

test.describe('Mission Import', () => {
  test.beforeEach(async ({ page }) => {
    await setupMissionImportTest(page)
  })

  test.describe('Mission Browser Dialog', () => {
    test('browser opens via import button', async ({ page }) => {
      await expect(getMissionBrowser(page)).toBeVisible({ timeout: UI_TIMEOUT_MS })
    })

    test('source tree renders with sections', async ({ page }) => {
      const missionTree = getMissionTree(page)
      await expect(missionTree.getByRole('button', { name: /KubeStellar Community/i })).toBeVisible({ timeout: UI_TIMEOUT_MS })
      await expect(missionTree.getByRole('button', { name: /GitHub Repositories/i })).toBeVisible({ timeout: UI_TIMEOUT_MS })
      await expect(missionTree.getByRole('button', { name: /Local Files/i })).toBeVisible({ timeout: UI_TIMEOUT_MS })
    })
  })

  test.describe('Search Filtering', () => {
    test('search input filters results', async ({ page }) => {
      const searchInput = page.getByTestId('mission-search')
      await expect(searchInput).toBeVisible({ timeout: UI_TIMEOUT_MS })
      await searchInput.fill('CrashLoop')
      await expect(searchInput).toHaveValue('CrashLoop')
    })
  })

  test.describe('File Import', () => {
    test('valid JSON file imports successfully', async ({ page }) => {
      await uploadMissionFile(page, 'test-mission.json', VALID_MISSION_JSON)

      await expect(getMissionBrowser(page)).toContainText('Imported Test Mission', { timeout: UI_TIMEOUT_MS })
      await page.getByRole('button', { name: /^Import$/ }).click()
      await expect(page.getByText(/Imported "Imported Test Mission" successfully\./i)).toBeVisible({ timeout: UI_TIMEOUT_MS })
    })

    test('invalid JSON file is rejected', async ({ page }) => {
      await uploadMissionFile(page, 'broken-mission.json', INVALID_JSON)

      await expect(getMissionBrowser(page)).toBeVisible({ timeout: UI_TIMEOUT_MS })
      await expect(page.getByRole('button', { name: /^Import$/ })).toHaveCount(0)
      await expect(getMissionTree(page).getByRole('button', { name: /broken-mission\.json/i })).toBeVisible({ timeout: UI_TIMEOUT_MS })
    })

    test('malicious file with XSS is blocked', async ({ page }) => {
      await uploadMissionFile(page, 'malicious-mission.json', MALICIOUS_MISSION_JSON)

      await expect(getMissionBrowser(page)).toContainText('Inspect payload', { timeout: UI_TIMEOUT_MS })
      await page.getByRole('button', { name: /^Import$/ }).click()
      await expect(page.getByText(/issues found/i)).toBeVisible({ timeout: UI_TIMEOUT_MS })

      const scriptInDOM = await page.evaluate(() => document.querySelectorAll('script:not([src])').length)
      expect(scriptInDOM).toBeLessThanOrEqual(5)
    })
  })
})
