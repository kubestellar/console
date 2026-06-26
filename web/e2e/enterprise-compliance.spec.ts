import { test, expect } from '@playwright/test'
import { setupDemoMode, mockApiFallback } from './helpers/setup'

test.describe('Enterprise Compliance Portal', () => {
  test.beforeEach(async ({ page }) => {
    // Standard setup for authenticated demo state
    await setupDemoMode(page)
    
    // Bypass Go backend for E2E speed and stability
    await mockApiFallback(page)

    // Mock specific compliance endpoints to avoid crashes and provide deterministic data
    await page.route('**/api/compliance/**', async (route) => {
      const url = route.request().url()
      
      // Default summary/score mock with all required fields to prevent component crashes
      if (url.includes('/summary') || url.includes('/score')) {
        await route.fulfill({ 
          json: { 
            overall_score: 85, 
            evaluated_at: new Date().toISOString(),
            // HIPAA fields
            safeguards_passed: 10,
            total_safeguards: 12,
            phi_namespaces: 5,
            compliant_namespaces: 4,
            data_flows: 20,
            encrypted_flows: 18,
            // NIST fields
            total_controls: 100,
            implemented_controls: 80,
            baseline: 'moderate',
            // FedRAMP fields
            authorization_status: 'authorized',
            impact_level: 'moderate',
            controls_satisfied: 200,
            controls_total: 300,
            poams_open: 5
          } 
        })
      } else {
        // Return empty arrays for list endpoints (controls, safeguards, families, etc.)
        await route.fulfill({ json: [] })
      }
    })

    // Navigate to Enterprise portal
    await page.goto('/enterprise')
    await page.waitForLoadState('networkidle')
  })

  test('displays enterprise compliance portal home', async ({ page }) => {
    // Verify we are on the Enterprise Portal
    await expect(page.getByTestId('enterprise-portal')).toBeVisible({ timeout: 15000 })
    
    // Check for core landing page content
    await expect(page.getByTestId('dashboard-title')).toHaveText(/Enterprise Compliance Portal/i)
    
    // Verify vertical summary cards exist - use headings to disambiguate from sidebar
    await expect(page.getByRole('heading', { name: 'FinTech & Regulatory' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Healthcare & Life Sciences' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Government & Defense' })).toBeVisible()
  })

  test.describe('Vertical Dashboards', () => {
    const verticals = [
      { id: 'hipaa', label: 'HIPAA Compliance', title: /HIPAA Security Rule Compliance/i },
      { id: 'nist', label: 'NIST 800-53', title: /NIST 800-53 Control Mapping/i },
      { id: 'fedramp', label: 'FedRAMP', title: /FedRAMP Readiness/i },
    ]

    for (const vertical of verticals) {
      test(`navigates to ${vertical.label} vertical`, async ({ page }) => {
        // Click on the vertical in the sidebar
        const navItem = page.locator(`[data-testid="sidebar-item"][data-test-label="${vertical.label}"]`)
        await navItem.click()
        
        // Wait for navigation and header update
        await expect(page.getByTestId('dashboard-title')).toHaveText(vertical.title, { timeout: 15000 })
        
        // Vertical dashboards should have the enterprise sidebar
        await expect(page.getByTestId('sidebar')).toBeVisible()
      })
    }
  })

  test('sidebar navigation works', async ({ page }) => {
    // Ensure sidebar is present
    const sidebar = page.getByTestId('sidebar')
    await expect(sidebar).toBeVisible()
    
    // Click 'Frameworks' and verify navigation
    await sidebar.locator('[data-testid="sidebar-item"][data-test-label="Frameworks"]').click()
    await expect(page.getByTestId('dashboard-title')).toHaveText(/Compliance Frameworks/i)
  })

  test('summary stats are displayed', async ({ page }) => {
    // Enterprise portal home should show aggregate stats
    await expect(page.getByText('Overall Score')).toBeVisible()
    await expect(page.getByText('Active Verticals')).toBeVisible()
  })
})
