import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const translations: Record<string, string> = {
  'compliance.licenseTitle': 'License Compliance',
  'compliance.licenseSubtitle': 'Open source license governance',
  'compliance.licenseDeniedLicenses': 'Denied Licenses',
  'compliance.licenseMustRemediate': 'Must remediate before release',
  'compliance.licenseWarnings': 'Warnings',
  'compliance.licenseRequireLegalReview': 'Requires legal review',
  'compliance.licenseAllowed': 'Allowed',
  'compliance.licenseUniqueLicenses': 'Unique Licenses',
  'compliance.licenseViolationsTab': 'Violations',
  'compliance.licenseFullInventoryTab': 'Inventory',
  'compliance.licenseCategoriesTab': 'Categories',
  'compliance.licensePackageHeader': 'Package',
  'compliance.licenseLicenseHeader': 'License',
  'compliance.licenseWorkloadHeader': 'Workload',
  'compliance.licenseClusterHeader': 'Cluster',
  'compliance.licenseRiskHeader': 'Risk',
}

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number; total?: number; date?: string }) => {
      if (key === 'compliance.licenseOfTotal') return `of ${options?.total ?? 0}`
      if (key === 'compliance.licenseWorkloadsScanned') return `${options?.count ?? 0} workloads scanned`
      if (key === 'compliance.licensePackageCount') return `${options?.count ?? 0} packages`
      if (key === 'compliance.licenseLastScanned') return `Last scanned ${options?.date ?? ''}`
      return translations[key] ?? key
    },
  }),
}))
vi.mock('../../lib/api', () => ({ authFetch: vi.fn() }))
vi.mock('../shared/DashboardHeader', () => ({
  DashboardHeader: ({ title, subtitle }: { title: string; subtitle?: string }) => (
    <div>
      <h1>{title}</h1>
      {subtitle ? <p>{subtitle}</p> : null}
    </div>
  ),
}))
vi.mock('../ui/RotatingTip', () => ({ RotatingTip: () => <div data-testid="rotating-tip" /> }))

import LicenseComplianceDashboard from './LicenseComplianceDashboard'

describe('LicenseComplianceDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const { authFetch } = require('../../lib/api')
    authFetch.mockImplementation((url: string) => {
      if (url.includes('/packages')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            {
              name: 'legacy-lib',
              version: '1.2.3',
              license: 'GPL-3.0',
              risk: 'denied',
              workload: 'payments-api',
              namespace: 'finance',
              cluster: 'prod-east',
              spdx_id: 'GPL-3.0-only',
            },
            {
              name: 'review-lib',
              version: '4.5.6',
              license: 'MPL-2.0',
              risk: 'warn',
              workload: 'ops-ui',
              namespace: 'ops',
              cluster: 'prod-west',
              spdx_id: 'MPL-2.0',
            },
          ]),
        })
      }

      if (url.includes('/categories')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            { name: 'Copyleft', count: 1, risk: 'denied', examples: ['legacy-lib'] },
          ]),
        })
      }

      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          total_packages: 2,
          allowed_packages: 0,
          warned_packages: 1,
          denied_packages: 1,
          unique_licenses: 2,
          workloads_scanned: 2,
          evaluated_at: '2026-01-01T00:00:00Z',
        }),
      })
    })
  })

  it('renders violations, inventory, and categories tabs', async () => {
    const user = userEvent.setup()

    render(<LicenseComplianceDashboard />)

    await waitFor(() => {
      expect(screen.getByText('License Compliance')).toBeInTheDocument()
      expect(screen.getByText('legacy-lib')).toBeInTheDocument()
      expect(screen.getByText('Denied Licenses')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'Inventory' }))
    expect(screen.getByText('review-lib')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Categories' }))
    expect(screen.getByText('Copyleft')).toBeInTheDocument()
    expect(screen.getByText('1 packages')).toBeInTheDocument()
  })
})
