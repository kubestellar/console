import { expect, test } from '@playwright/test'
import { setupDemoMode } from '../helpers/setup'

const reservation = {
  id: 'visual-reservation', user_id: 'user', user_name: 'alice', title: 'Visual GPU job',
  description: '', cluster: 'visual-cluster', namespace: 'training', gpu_count: 1,
  gpu_type: 'NVIDIA A100', start_date: '2026-01-01', duration_hours: 24, notes: '',
  status: 'active', quota_name: '', quota_enforced: false, created_at: '2026-01-01T00:00:00Z',
}
const snapshot = {
  id: 'snapshot', reservation_id: reservation.id, timestamp: '2026-01-01T00:00:00Z',
  gpu_utilization_pct: 50, memory_utilization_pct: 40, active_gpu_count: 1, total_gpu_count: 1,
}

for (const theme of ['kubestellar', 'kubestellar-light']) {
  test(`GPU utilization labels follow ${theme} theme`, async ({ page }) => {
    await setupDemoMode(page)
    await page.addInitScript((themeId) => {
      // A session token permits utilization requests while the rest of the app uses demo data.
      sessionStorage.setItem('token', 'visual-test-token')
      localStorage.setItem('kubestellar-theme-id', themeId)
    }, theme)
    await page.route('**/src/**', route => route.continue())
    await page.route('**/api/gpu/reservations*', route => route.fulfill({ json: [reservation] }))
    await page.route('**/api/gpu/utilizations?*', route => route.fulfill({ json: { [reservation.id]: [snapshot] } }))
    await page.goto('/gpu-reservations', { waitUntil: 'domcontentloaded' })
    const average = page.getByText(/Avg 50% GPU/i).first()
    await expect(average).toBeVisible()
    await expect(average).toHaveScreenshot(`gpu-overview-average-${theme}.png`)
    await page.getByRole('tab', { name: /Reservations/ }).click()
    await expect(average).toBeVisible()
    await expect(average).toHaveScreenshot(`gpu-reservation-average-${theme}.png`)
  })
}
