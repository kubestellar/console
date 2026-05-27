import { test, expect, type Locator, type Page } from '@playwright/test'
import { setupDemoMode } from '../helpers/setup'
import { CIRCUIT_ZOOM_STORAGE_KEY } from '../../src/components/cards/quantum/QuantumCircuitViewer.constants'

const PAGE_VISIBLE_TIMEOUT_MS = 15_000
const CARD_VISIBLE_TIMEOUT_MS = 15_000
const DESKTOP_VIEWPORT = { width: 1440, height: 1400 }

async function setupQuantumPage(page: Page) {
  await setupDemoMode(page)
  await page.goto('/quantum')
  await expect(page.getByTestId('sidebar')).toBeVisible({
    timeout: PAGE_VISIBLE_TIMEOUT_MS,
  })
  await expect(page.getByTestId('dashboard-cards-grid')).toBeVisible({
    timeout: PAGE_VISIBLE_TIMEOUT_MS,
  })
}

async function expectCardScreenshot(card: Locator, fileName: string) {
  await expect(card).toBeAttached({ timeout: CARD_VISIBLE_TIMEOUT_MS })
  await card.scrollIntoViewIfNeeded()
  await expect(card).toBeVisible({ timeout: CARD_VISIBLE_TIMEOUT_MS })
  await expect(card).toHaveScreenshot(fileName)
}

test.describe('Quantum dashboard cards', () => {
  test.use({ viewport: DESKTOP_VIEWPORT })

  test('execution histogram and qubit grid keep bottom content visible', async ({ page }) => {
    await setupQuantumPage(page)

    const qubitGridCard = page.locator('h2:has-text("Quantum Qubit Grid")').first().locator('xpath=ancestor::*[@data-card-type][1]')
    const histogramCard = page.locator('h2:has-text("Execution Histogram")').first().locator('xpath=ancestor::*[@data-card-type][1]')

    await expectCardScreenshot(qubitGridCard, 'app-quantum-qubit-grid-card.png')
    await expectCardScreenshot(histogramCard, 'app-quantum-histogram-card.png')
  })

  test('circuit viewer renders zoom controls and small zoom levels visibly shrink the diagram', async ({ page }) => {
    // Clear persisted zoom so the 100% baseline is deterministic regardless of
    // any prior test run or shared storage state.
    await page.addInitScript((key: string) => {
      try {
        window.localStorage.removeItem(key)
      } catch {
        // localStorage unavailable; baseline still works since component falls back to 100%.
      }
    }, CIRCUIT_ZOOM_STORAGE_KEY)

    await setupQuantumPage(page)

    const circuitCard = page
      .locator('h2:has-text("Quantum Circuit")')
      .first()
      .locator('xpath=ancestor::*[@data-card-type][1]')

    await expect(circuitCard).toBeAttached({ timeout: CARD_VISIBLE_TIMEOUT_MS })
    await circuitCard.scrollIntoViewIfNeeded()
    await expect(circuitCard).toBeVisible({ timeout: CARD_VISIBLE_TIMEOUT_MS })

    // All ten zoom level buttons must be present.
    const zoomLevels = [15, 20, 25, 35, 50, 65, 85, 100, 125, 150]
    for (const pct of zoomLevels) {
      await expect(circuitCard.getByRole('button', { name: `${pct}%`, exact: true })).toBeVisible()
    }

    // Default 100%: capture baseline.
    await expectCardScreenshot(circuitCard, 'app-quantum-circuit-card-zoom-100.png')

    // 25%: must visibly shrink (regression check for font-size clamping bug).
    await circuitCard.getByRole('button', { name: '25%', exact: true }).click()
    await expectCardScreenshot(circuitCard, 'app-quantum-circuit-card-zoom-25.png')

    // 15%: smallest level — must also visibly differ from 25%.
    await circuitCard.getByRole('button', { name: '15%', exact: true }).click()
    await expectCardScreenshot(circuitCard, 'app-quantum-circuit-card-zoom-15.png')
  })
})
