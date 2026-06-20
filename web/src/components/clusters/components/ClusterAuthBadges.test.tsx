import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ClusterAuthBadges, ClusterIAMRefreshHint } from './ClusterAuthBadges'
import type { ClusterInfo } from '../../../hooks/useMCP'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

describe('ClusterAuthBadges', () => {
  it('renders IAM badge for exec auth method', () => {
    const cluster = { authMethod: 'exec', name: 'test', user: 'test' } as ClusterInfo
    render(<ClusterAuthBadges cluster={cluster} className="test-class" />)

    const badge = screen.getByText('IAM')
    expect(badge).toBeInTheDocument()
    expect(badge).toHaveClass('test-class')
  })

  it('renders token badge for token auth method', () => {
    const cluster = { authMethod: 'token', name: 'test', user: 'test' } as ClusterInfo
    render(<ClusterAuthBadges cluster={cluster} className="test-class" />)

    expect(screen.getByText('token')).toBeInTheDocument()
  })

  it('renders cert badge for certificate auth method', () => {
    const cluster = { authMethod: 'certificate', name: 'test', user: 'test' } as ClusterInfo
    render(<ClusterAuthBadges cluster={cluster} className="test-class" />)

    expect(screen.getByText('cert')).toBeInTheDocument()
  })

  it('renders IAM badge for auth-provider auth method', () => {
    const cluster = { authMethod: 'auth-provider', name: 'test', user: 'test' } as ClusterInfo
    render(<ClusterAuthBadges cluster={cluster} className="test-class" />)

    expect(screen.getByText('IAM')).toBeInTheDocument()
  })

  it('returns null when authMethod is not set', () => {
    const cluster = { name: 'test' } as ClusterInfo
    const { container } = render(<ClusterAuthBadges cluster={cluster} className="test-class" />)

    expect(container.firstChild).toBeNull()
  })

  it('returns null when authMethod is unknown', () => {
    const cluster = { authMethod: 'unknown-method', name: 'test' } as ClusterInfo
    const { container } = render(<ClusterAuthBadges cluster={cluster} className="test-class" />)

    expect(container.firstChild).toBeNull()
  })

  it('includes login hint in title for exec auth with AWS', () => {
    const cluster = { authMethod: 'exec', user: 'aws-user', name: 'test' } as ClusterInfo
    render(<ClusterAuthBadges cluster={cluster} className="test-class" />)

    const badge = screen.getByText('IAM')
    expect(badge).toHaveAttribute('title', expect.stringContaining('aws sso login'))
  })

  it('does not include login hint in title for exec auth without provider detection', () => {
    const cluster = { authMethod: 'exec', user: 'unknown', name: 'test' } as ClusterInfo
    render(<ClusterAuthBadges cluster={cluster} className="test-class" />)

    const badge = screen.getByText('IAM')
    expect(badge).toHaveAttribute('title', 'Auth: IAM (exec plugin)')
  })
})

describe('ClusterIAMRefreshHint', () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    })
  })

  it('renders login hint for exec auth with expired token', () => {
    const cluster = {
      authMethod: 'exec',
      user: 'aws-user',
      name: 'test',
      errorType: 'auth',
      reachable: false,
    } as ClusterInfo
    render(<ClusterIAMRefreshHint cluster={cluster} className="test-class" />)

    expect(screen.getByText('aws sso login')).toBeInTheDocument()
    expect(screen.getByText(/Login:/)).toBeInTheDocument()
  })

  it('renders login hint for unreachable exec cluster', () => {
    const cluster = {
      authMethod: 'exec',
      user: 'gke-user',
      name: 'test',
      reachable: false,
    } as ClusterInfo
    render(<ClusterIAMRefreshHint cluster={cluster} className="test-class" />)

    expect(screen.getByText('gcloud auth login')).toBeInTheDocument()
  })

  it('does not render for non-exec auth', () => {
    const cluster = {
      authMethod: 'token',
      errorType: 'auth',
      reachable: false,
    } as ClusterInfo
    const { container } = render(<ClusterIAMRefreshHint cluster={cluster} className="test-class" />)

    expect(container.firstChild).toBeNull()
  })

  it('does not render for reachable cluster with valid token', () => {
    const cluster = {
      authMethod: 'exec',
      user: 'aws-user',
      name: 'test',
      reachable: true,
    } as ClusterInfo
    const { container } = render(<ClusterIAMRefreshHint cluster={cluster} className="test-class" />)

    expect(container.firstChild).toBeNull()
  })

  it('does not render when no IAM hint is available', () => {
    const cluster = {
      authMethod: 'exec',
      user: 'unknown',
      name: 'test',
      errorType: 'auth',
      reachable: false,
    } as ClusterInfo
    const { container } = render(<ClusterIAMRefreshHint cluster={cluster} className="test-class" />)

    expect(container.firstChild).toBeNull()
  })

  it('renders custom label when provided', () => {
    const cluster = {
      authMethod: 'exec',
      user: 'az-user',
      name: 'test',
      errorType: 'auth',
      reachable: false,
    } as ClusterInfo
    render(<ClusterIAMRefreshHint cluster={cluster} className="test-class" label="Custom:" />)

    expect(screen.getByText(/Custom:/)).toBeInTheDocument()
  })

  it('renders without label when label is null', () => {
    const cluster = {
      authMethod: 'exec',
      user: 'az-user',
      name: 'test',
      errorType: 'auth',
      reachable: false,
    } as ClusterInfo
    render(<ClusterIAMRefreshHint cluster={cluster} className="test-class" label={null} />)

    expect(screen.queryByText(/Login:/)).not.toBeInTheDocument()
    expect(screen.getByText('az login')).toBeInTheDocument()
  })

  it('includes copy button', () => {
    const cluster = {
      authMethod: 'exec',
      user: 'aws-user',
      name: 'test',
      errorType: 'auth',
      reachable: false,
    } as ClusterInfo
    render(<ClusterIAMRefreshHint cluster={cluster} className="test-class" />)

    expect(screen.getByLabelText('Copy command to clipboard')).toBeInTheDocument()
  })
})
