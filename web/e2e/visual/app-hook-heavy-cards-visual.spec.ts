import { test, expect, type Page } from '@playwright/test'
import { setupDemoMode } from '../helpers/setup'

const VIEWPORT = { width: 1440, height: 1000 }
const CONTENT_TIMEOUT_MS = 30_000
const CARD_POSITION = { w: 12, h: 8 }
const FIXED_TIME = new Date('2026-10-17T12:10:00Z')

test.use({ viewport: VIEWPORT, locale: 'en-US', timezoneId: 'Europe/Paris' })

async function openCard(page: Page, type: string) {
  await page.clock.setFixedTime(FIXED_TIME)
  await setupDemoMode(page)
  // Permit Vite source requests when verifying locally without a production build.
  await page.route('**/src/**', route => route.continue())
  await page.addInitScript(({ type, position }) => {
    localStorage.setItem('kc-demo-mode', 'true')
    localStorage.setItem('kubestellar-pods-cards', JSON.stringify([
      { id: `hook-split-${type}`, card_type: type, config: {}, position },
    ]))
    // A deterministic next-piece preview makes Tetris screenshots reproducible.
    Math.random = () => 0.42
  }, { type, position: CARD_POSITION })
  await page.goto('/pods')
  const card = page.locator(`[data-card-type="${type}"]`)
  await expect(card).toBeVisible({ timeout: CONTENT_TIMEOUT_MS })
  await card.scrollIntoViewIfNeeded()
  return card
}

test('EventsTimeline retains its chart, totals, and time-range control', async ({ page }) => {
  const card = await openCard(page, 'events_timeline')
  const range = card.locator('select')
  await expect(range).toBeVisible({ timeout: CONTENT_TIMEOUT_MS })
  await expect(card.getByRole('img', { name: /Events timeline chart/ })).toBeVisible()
  await expect(card.locator('canvas, svg').last()).toBeVisible()
  await range.selectOption('6h')
  await expect(range).toHaveValue('6h')
  await expect(card).toHaveScreenshot('hook-split-events-timeline.png', {
    mask: [card.locator('time'), card.locator('[title*="refresh" i]')],
  })
})

test('IframeEmbed retains configuration and the demo placeholder', async ({ page }) => {
  const card = await openCard(page, 'iframe_embed')
  await expect(card.locator('input[type="url"]')).toBeVisible({ timeout: CONTENT_TIMEOUT_MS })
  await expect(card).toHaveScreenshot('hook-split-iframe-settings.png')
  await card.getByRole('button', { name: /Grafana/ }).click()
  await expect(card.locator('input[type="url"]')).toHaveValue('http://localhost:3000')
  await card.getByRole('button', { name: /Save.*Load/i }).click()
  await expect(card.locator('input[type="url"]')).toHaveCount(0)
  await expect(card.locator('iframe')).toHaveCount(0)
  await expect(card.getByText('Grafana', { exact: true })).toBeVisible()
  await expect(card).toHaveScreenshot('hook-split-iframe-demo.png')
})

test('Kubedle retains its board, help, and statistics', async ({ page }) => {
  const card = await openCard(page, 'kubedle')
  await expect(card.getByRole('button', { name: 'ENTER', exact: true })).toBeVisible({ timeout: CONTENT_TIMEOUT_MS })
  await expect(card).toHaveScreenshot('hook-split-kubedle-board.png')
  await card.getByRole('button', { name: /How to Play/i }).click()
  await expect(card.getByRole('button', { name: /Close help/i })).toBeVisible()
  await expect(card).toHaveScreenshot('hook-split-kubedle-help.png')
  await card.getByRole('button', { name: /Close help/i }).click()
  await card.getByRole('button', { name: 'Statistics', exact: true }).click()
  await expect(card.getByRole('button', { name: /Close statistics/i })).toBeVisible()
  await expect(card).toHaveScreenshot('hook-split-kubedle-stats.png')
})

test('ContainerTetris retains the start and pause controls', async ({ page }) => {
  const card = await openCard(page, 'container_tetris')
  await expect(card.getByRole('button', { name: 'Start Game', exact: true })).toBeVisible({ timeout: CONTENT_TIMEOUT_MS })
  await expect(card.getByTestId('tetris-board')).toBeVisible()
  await expect(card).toHaveScreenshot('hook-split-tetris-start.png')
  await card.getByRole('button', { name: 'Start Game', exact: true }).click()
  await card.getByRole('button', { name: 'Pause', exact: true }).click()
  await expect(card.getByRole('button', { name: 'Resume', exact: true }).last()).toBeVisible()
  await expect(card).toHaveScreenshot('hook-split-tetris-paused.png')
})
