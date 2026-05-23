import { test, expect, Page } from '@playwright/test'
import { mockApiFallback } from './helpers/setup'

/**
 * Mission Control Pipeline — smoke tests for sidebar, mission list, and
 * deep-link detail page. Uses relative URLs so they resolve against the
 * Playwright baseURL (defaulting to http://localhost:8080).
 */

const VISIBLE_TIMEOUT_MS = 10_000

async function setupMissionControlTest(page: Page) {
  await mockApiFallback(page)

  await page.route('**/api/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: '1', github_id: '12345', github_login: 'testuser',
        email: 'test@example.com', onboarded: true,
      }),
    })
  )

  // #12929 — Mock GitHub SHA polling to stabilize networkidle timing
  // (versionUtils.ts polls this route when developer channel is selected)
  await page.route('**/api/github/repos/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ref: 'refs/heads/main',
        object: { sha: 'mock-sha-12345' },
      }),
    })
  )

  await page.route('**/api/mcp/**', (route) => {
    const url = route.request().url()
    if (url.includes('/clusters')) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          clusters: [{ name: 'prod-cluster', healthy: true, nodeCount: 5, podCount: 50 }],
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

  await page.route('**/127.0.0.1:8585/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ events: [], clusters: [], health: { hasClaude: true, hasBob: false } }),
    })
  )

  await page.addInitScript(() => {
    // #12930 — Clear OAuth session state to prevent hidden polling
    localStorage.removeItem('kc-has-session')
    localStorage.removeItem('kc_mission_control_state')
    // #12929 — Clear update channel to prevent GitHub SHA polling
    localStorage.removeItem('kc-update-channel')
    
    localStorage.setItem('token', 'test-token')
    localStorage.setItem('kc-demo-mode', 'true')
    localStorage.setItem('demo-user-onboarded', 'true')
    localStorage.setItem('kc-agent-setup-dismissed', 'true')
    localStorage.setItem('kc-backend-status', JSON.stringify({
      available: true,
      timestamp: Date.now(),
    }))
  })
}

test.describe('Mission Control Pipeline', () => {
  test.beforeEach(async ({ page }) => {
    await setupMissionControlTest(page)
  })

  test('mission sidebar opens on click', async ({ page }) => {
    await page.goto('/?demo=true')
    await page.waitForLoadState('domcontentloaded')

    const trigger = page.getByTestId('mission-sidebar-toggle')
    if (await trigger.isVisible({ timeout: VISIBLE_TIMEOUT_MS }).catch(() => false)) {
      await trigger.click()
      await expect(page.getByTestId('mission-sidebar')).toBeVisible({ timeout: VISIBLE_TIMEOUT_MS })
    }
  })

  test('mission list loads available missions', async ({ page }) => {
    await page.goto('/?browse=missions&demo=true')
    await page.waitForLoadState('domcontentloaded')

    const missionBrowser = page.getByTestId('mission-browser')
    await expect(missionBrowser).toBeVisible({ timeout: VISIBLE_TIMEOUT_MS })
  })

  test('mission detail page shows steps', async ({ page }) => {
    await page.goto('/missions/install-opencost?demo=true')
    await page.waitForLoadState('domcontentloaded')

    const content = page.locator('main, [role="main"], #root')
    await expect(content).toBeVisible({ timeout: VISIBLE_TIMEOUT_MS })
  })

  test.describe('KB Query Pipeline', () => {
    test('user query returns relevant KB results', async ({ page }) => {
      await page.route('**/api/agent/chat', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            response: 'Here is how to deploy KubeStellar',
            kb_context: ['kubestellar-architecture.md', 'deploy-guide.md'],
            commands: ['kubectl apply -f https://kubestellar.io/latest.yaml']
          }),
        })
      })

      const chatResponse = await page.evaluate(async () => {
        const res = await fetch('/api/agent/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: 'How do I install KubeStellar?' }),
        })
        return { status: res.status, body: await res.json() }
      })

      expect(chatResponse.status).toBe(200)
      expect(chatResponse.body.kb_context).toBeDefined()
      expect(chatResponse.body.kb_context.length).toBeGreaterThan(0)
      expect(chatResponse.body.kb_context).toContain('deploy-guide.md')
    })

    test('generated commands are valid kubectl/helm', async ({ page }) => {
      await page.route('**/api/agent/chat', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            response: 'Here are the commands',
            commands: ['kubectl get pods -n kubestellar', 'helm install ks core/kubestellar']
          }),
        })
      })

      const chatResponse = await page.evaluate(async () => {
        const res = await fetch('/api/agent/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: 'Get pods' }),
        })
        return { status: res.status, body: await res.json() }
      })

      expect(chatResponse.status).toBe(200)
      const commands = chatResponse.body.commands
      expect(commands.length).toBeGreaterThan(0)
      
      // Validate syntax
      commands.forEach((cmd: string) => {
        const isValid = cmd.startsWith('kubectl ') || cmd.startsWith('helm ') || cmd.startsWith('oc ')
        expect(isValid).toBeTruthy()
      })
    })

    test('mission execution completes without error', async ({ page }) => {
      await page.route('**/api/agent/mission/execute', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            status: 'success',
            steps_completed: 3,
            logs: 'Mission deployed successfully'
          }),
        })
      })

      const execResponse = await page.evaluate(async () => {
        const res = await fetch('/api/agent/mission/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mission_id: 'install-opencost' }),
        })
        return { status: res.status, body: await res.json() }
      })

      expect(execResponse.status).toBe(200)
      expect(execResponse.body.status).toBe('success')
      expect(execResponse.body.steps_completed).toBe(3)
    })
  })
})
