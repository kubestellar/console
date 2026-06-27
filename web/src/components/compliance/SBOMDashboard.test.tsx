import React from 'react'
import type { ReactNode } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { authFetch } from '../../lib/api'

vi.mock('../../lib/api', () => ({ authFetch: vi.fn() }))
vi.mock('../../lib/unified/dashboard/UnifiedDashboard', () => ({
  UnifiedDashboard: () => <div data-testid="unified-dashboard" />,
}))
vi.mock('../shared/DashboardHeader', () => ({
  DashboardHeader: ({ title, subtitle, afterTitle, rightExtra }: { title: string; subtitle?: string; afterTitle?: ReactNode; rightExtra?: ReactNode }) => (
    <div>
      <h1>{title}</h1>
      {subtitle ? <p>{subtitle}</p> : null}
      {afterTitle}
      {rightExtra}
    </div>
  ),
}))
vi.mock('../ui/RotatingTip', () => ({ RotatingTip: () => <div data-testid="rotating-tip" /> }))
vi.mock('../dashboard/DashboardHealthIndicator', () => ({
  DashboardHealthIndicator: () => <div data-testid="dashboard-health-indicator" />,
}))

import SBOMDashboard from './SBOMDashboard'

describe('SBOMDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const mockedAuthFetch = vi.mocked(authFetch)
    mockedAuthFetch.mockImplementation((url: string) => {
      if (url.includes('/documents')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            {
              id: 'doc-1',
              format: 'cyclonedx',
              components: [
                {
                  name: 'react',
                  version: '18.3.0',
                  purl: 'pkg:npm/react@18.3.0',
                  license: 'MIT',
                  vulnerabilities: 2,
                  severity: 'high',
                },
              ],
            },
          ]),
        })
      }

      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          total_components: 1,
          vulnerable_components: 1,
          critical_count: 0,
          high_count: 1,
          generated_at: '2026-01-01T00:00:00Z',
        }),
      })
    })
  })

  it('renders package and vulnerability views with unified dashboard and health indicators', async () => {
    const user = userEvent.setup()

    render(<SBOMDashboard />)

    await waitFor(() => {
      expect(screen.getByText('SBOM Manager')).toBeInTheDocument()
      expect(screen.getByTestId('dashboard-health-indicator')).toBeInTheDocument()
      expect(screen.getByText('react')).toBeInTheDocument()
      expect(screen.getByText('License Compliance')).toBeInTheDocument()
      expect(screen.getByTestId('unified-dashboard')).toBeInTheDocument()
      
      // Verify health status indicator is present
      expect(screen.getByText('Supply Chain Health')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /Vulnerabilities \(1\)/ }))
    expect(screen.getByText('Detected vulnerability')).toBeInTheDocument()
    expect(screen.getByText('Unknown')).toBeInTheDocument()
  })
})
