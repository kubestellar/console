import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PreflightFailure } from './PreflightFailure'
import type { PreflightError } from '../../lib/missions/preflightCheck'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'actions.retry': 'Retry',
        'actions.copy': 'Copy',
        'actions.copied': 'Copied',
      }
      return map[key] ?? key
    },
  }),
}))

vi.mock('../../lib/missions/preflightCheck', () => ({
  getRemediationActions: vi.fn(() => []),
}))

vi.mock('../../lib/clipboard', () => ({
  copyToClipboard: vi.fn(() => Promise.resolve(true)),
}))

describe('PreflightFailure', () => {
  const mockError: PreflightError = {
    code: 'MISSING_CREDENTIALS',
    message: 'No credentials found for the cluster',
  }

  it('renders the error title and message', () => {
    render(<PreflightFailure error={mockError} />)
    expect(screen.getByText('Missing Credentials')).toBeInTheDocument()
    expect(screen.getByText('No credentials found for the cluster')).toBeInTheDocument()
  })

  it('displays the error code badge', () => {
    render(<PreflightFailure error={mockError} />)
    expect(screen.getByText('MISSING_CREDENTIALS')).toBeInTheDocument()
  })

  it('renders context information when provided', () => {
    render(<PreflightFailure error={mockError} context="minikube" />)
    expect(screen.getByText('Cluster context:')).toBeInTheDocument()
    expect(screen.getByText('minikube')).toBeInTheDocument()
  })

  it('renders with different error codes', () => {
    const rbacError: PreflightError = {
      code: 'RBAC_DENIED',
      message: 'Permission denied',
    }
    render(<PreflightFailure error={rbacError} />)
    expect(screen.getByText('Permission Denied')).toBeInTheDocument()
  })

  it('has correct data attributes for testing', () => {
    render(<PreflightFailure error={mockError} />)
    const container = screen.getByTestId('preflight-failure')
    expect(container).toHaveAttribute('data-error-code', 'MISSING_CREDENTIALS')
  })
})
