import React from 'react'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ComplianceDrillDown } from './ComplianceDrillDown'

vi.mock('../../../hooks/useTrestle', () => ({
  useTrestle: () => ({
    statuses: {
      'cluster-a': {
        installed: true,
        controlResults: [
          {
            controlId: 'AC-1',
            title: 'Access Control Policy',
            description: 'Policy exists',
            severity: 'high',
            status: 'fail',
            profile: 'baseline',
          },
        ],
      },
    },
  }),
}))

vi.mock('../../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => ({ selectedClusters: [] }),
}))

describe('ComplianceDrillDown', () => {
  it('renders compliance rows from trestle data', () => {
    render(
      <ComplianceDrillDown
        data={{ filterStatus: 'failing', passing: 0, failing: 1, warning: 0, totalChecks: 1 }}
      />
    )

    expect(screen.getByText('OSCAL Compliance Controls')).toBeInTheDocument()
    expect(screen.getByText('AC-1')).toBeInTheDocument()
  })
})
