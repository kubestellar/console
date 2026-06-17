import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ClusterAuthBadges, ClusterIAMRefreshHint } from './ClusterAuthBadges'
import type { ClusterInfo } from '../../../hooks/useMCP'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('../../../lib/clipboard', () => ({
  copyToClipboard: vi.fn(),
}))

describe('ClusterAuthBadges', () => {
  it('renders IAM badge and exec login hint in the title', () => {
    const cluster = { authMethod: 'exec', name: 'eks-prod', user: 'aws-user' } as ClusterInfo

    render(<ClusterAuthBadges cluster={cluster} className="test-class" />)

    const badge = screen.getByText('IAM')
    expect(badge).toHaveClass('test-class')
    expect(badge).toHaveAttribute('title', expect.stringContaining('aws sso login'))
  })

  it('renders token and certificate badges for supported auth methods', () => {
    const { rerender } = render(
      <ClusterAuthBadges
        cluster={{ authMethod: 'token', name: 'demo', user: 'demo' } as ClusterInfo}
        className="token-class"
      />,
    )

    expect(screen.getByText('token')).toBeInTheDocument()

    rerender(
      <ClusterAuthBadges
        cluster={{ authMethod: 'certificate', name: 'demo', user: 'demo' } as ClusterInfo}
        className="cert-class"
      />,
    )

    expect(screen.getByText('cert')).toBeInTheDocument()
  })

  it('returns null for missing or unsupported auth methods', () => {
    const { container, rerender } = render(
      <ClusterAuthBadges cluster={{ name: 'demo' } as ClusterInfo} className="ignored" />,
    )

    expect(container.firstChild).toBeNull()

    rerender(
      <ClusterAuthBadges
        cluster={{ authMethod: 'custom', name: 'demo' } as ClusterInfo}
        className="ignored"
      />,
    )

    expect(container.firstChild).toBeNull()
  })
})

describe('ClusterIAMRefreshHint', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders an IAM login hint for expired exec tokens', () => {
    render(
      <ClusterIAMRefreshHint
        cluster={{
          authMethod: 'exec',
          user: 'aws-user',
          name: 'demo',
          errorType: 'auth',
          reachable: false,
        } as ClusterInfo}
        className="hint-class"
      />,
    )

    expect(screen.getByText(/Login:/)).toBeInTheDocument()
    expect(screen.getByText('aws sso login')).toBeInTheDocument()
    expect(screen.getByLabelText('Copy command to clipboard')).toBeInTheDocument()
  })

  it('supports custom and omitted labels', () => {
    const { rerender } = render(
      <ClusterIAMRefreshHint
        cluster={{
          authMethod: 'exec',
          user: 'az-user',
          name: 'demo',
          errorType: 'auth',
          reachable: false,
        } as ClusterInfo}
        className="hint-class"
        label="Custom:"
      />,
    )

    expect(screen.getByText(/Custom:/)).toBeInTheDocument()

    rerender(
      <ClusterIAMRefreshHint
        cluster={{
          authMethod: 'exec',
          user: 'az-user',
          name: 'demo',
          errorType: 'auth',
          reachable: false,
        } as ClusterInfo}
        className="hint-class"
        label={null}
      />,
    )

    expect(screen.queryByText(/Login:/)).not.toBeInTheDocument()
    expect(screen.getByText('az login')).toBeInTheDocument()
  })

  it('returns null when the cluster does not need or cannot infer refresh help', () => {
    const { container, rerender } = render(
      <ClusterIAMRefreshHint
        cluster={{
          authMethod: 'token',
          errorType: 'auth',
          reachable: false,
        } as ClusterInfo}
        className="hint-class"
      />,
    )

    expect(container.firstChild).toBeNull()

    rerender(
      <ClusterIAMRefreshHint
        cluster={{
          authMethod: 'exec',
          user: 'custom-user',
          name: 'custom-cluster',
          errorType: 'auth',
          reachable: false,
        } as ClusterInfo}
        className="hint-class"
      />,
    )

    expect(container.firstChild).toBeNull()
  })
})
