import { test, expect } from '@playwright/test'
import { setupDemoMode } from '../helpers/setup'

const VIEWPORT = { width: 1440, height: 1000 }
const CONTENT_TIMEOUT_MS = 30_000

test.use({ viewport: VIEWPORT, locale: 'en-US', timezoneId: 'UTC' })

test('priority menu keeps keyboard focus visible and restores its trigger', async ({ page }) => {
  await setupDemoMode(page)
  await page.route('**/src/**', route => route.continue())
  await page.goto('/')
  await page.getByRole('button', { name: 'Open AI Missions', exact: true }).click()
  await page.getByRole('button', { name: 'Mission Control', exact: true }).click()
  const dialog = page.getByTestId('mission-control-dialog')
  await expect(dialog).toBeVisible({ timeout: CONTENT_TIMEOUT_MS })
  await page.getByTestId('mission-control-phase-1').click()
  const trigger = dialog.getByRole('button', { name: 'required', exact: true }).first()
  await trigger.focus()
  await trigger.press('ArrowDown')
  const menu = page.getByRole('menu')
  await expect(menu.getByRole('menuitemradio', { name: 'required' })).toBeFocused()
  await page.keyboard.press('End')
  await expect(menu.getByRole('menuitemradio', { name: 'optional' })).toBeFocused()
  await expect(menu).toHaveScreenshot('priority-menu-keyboard-focus.png')
  await page.keyboard.press('Escape')
  await expect(menu).not.toBeVisible()
  await expect(dialog).toBeVisible()
  await expect(trigger).toBeFocused()
  await trigger.press('ArrowDown')
  await page.keyboard.press('End')
  await page.keyboard.press('Space')
  const updatedTrigger = dialog.getByRole('button', { name: 'optional', exact: true }).first()
  await expect(updatedTrigger).toBeFocused()
  await expect(menu).not.toBeVisible()
  await updatedTrigger.press('ArrowDown')
  await page.keyboard.press('Home')
  await page.keyboard.press('Enter')
  await expect(trigger).toBeFocused()
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
})
