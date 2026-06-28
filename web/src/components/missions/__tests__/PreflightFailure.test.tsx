import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PreflightFailure } from '../PreflightFailure'
import type { PreflightError } from '../../../lib/missions/preflightCheck'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, string>) => opts?.defaultValue || key,
  }),
}))

vi.mock('../../../lib/missions/preflightCheck', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return {
    ...actual,
    getRemediationActions: () => [],
  }
})

vi.mock('../../../lib/clipboard', () => ({
  copyToClipboard: vi.fn().mockResolvedValue(true),
}))

describe('PreflightFailure', () => {
  const makeError = (code: string, message: string): PreflightError => ({
    code: code as PreflightError['code'],
    message,
  })

  it('renders with MISSING_CREDENTIALS error code', () => {
    const error = makeError('MISSING_CREDENTIALS', 'No kubeconfig found')
    const { container } = render(<PreflightFailure error={error} />)
    const el = container.querySelector('[data-testid="preflight-failure"]')
    expect(el).toBeTruthy()
    expect(el?.getAttribute('data-error-code')).toBe('MISSING_CREDENTIALS')
    expect(screen.getByText('Missing Credentials')).toBeTruthy()
    expect(screen.getByText('No kubeconfig found')).toBeTruthy()
  })

  it('renders with EXPIRED_CREDENTIALS error code', () => {
    const error = makeError('EXPIRED_CREDENTIALS', 'Token expired')
    render(<PreflightFailure error={error} />)
    expect(screen.getByText('Expired Credentials')).toBeTruthy()
    expect(screen.getByText('Token expired')).toBeTruthy()
  })

  it('renders with RBAC_DENIED error code', () => {
    const error = makeError('RBAC_DENIED', 'Access denied to namespace')
    render(<PreflightFailure error={error} />)
    expect(screen.getByText('Permission Denied')).toBeTruthy()
  })

  it('renders with CONTEXT_NOT_FOUND error code', () => {
    const error = makeError('CONTEXT_NOT_FOUND', 'Context "prod" not found')
    render(<PreflightFailure error={error} />)
    expect(screen.getByText('Context Not Found')).toBeTruthy()
  })

  it('renders with CLUSTER_UNREACHABLE error code', () => {
    const error = makeError('CLUSTER_UNREACHABLE', 'Connection refused')
    render(<PreflightFailure error={error} />)
    expect(screen.getByText('Cluster Unreachable')).toBeTruthy()
  })

  it('renders with MISSING_TOOLS error code', () => {
    const error = makeError('MISSING_TOOLS', 'kubectl not found')
    render(<PreflightFailure error={error} />)
    expect(screen.getByText('Missing Tools')).toBeTruthy()
  })

  it('renders with UNKNOWN_EXECUTION_FAILURE error code', () => {
    const error = makeError('UNKNOWN_EXECUTION_FAILURE', 'Something went wrong')
    render(<PreflightFailure error={error} />)
    expect(screen.getByText('Preflight Check Failed')).toBeTruthy()
  })

  it('shows cluster context when provided', () => {
    const error = makeError('RBAC_DENIED', 'Access denied')
    render(<PreflightFailure error={error} context="my-cluster" />)
    expect(screen.getByText('my-cluster')).toBeTruthy()
  })

  it('does not show context when not provided', () => {
    const error = makeError('RBAC_DENIED', 'Access denied')
    const { container } = render(<PreflightFailure error={error} />)
    expect(container.textContent).not.toContain('Cluster context:')
  })

  it('displays the error code badge', () => {
    const error = makeError('MISSING_CREDENTIALS', 'Missing creds')
    render(<PreflightFailure error={error} />)
    expect(screen.getByText('MISSING_CREDENTIALS')).toBeTruthy()
  })
})
