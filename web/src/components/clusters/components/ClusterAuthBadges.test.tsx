import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import type { ClusterInfo } from '../../../hooks/useMCP'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en', changeLanguage: vi.fn() } }),
}))

vi.mock('./ClusterTokenRefresh', () => ({
  isTokenExpired: () => false,
  getIAMRefreshHint: () => 'aws sso login',
  CopyCommandButton: () => <button data-testid="copy-button">Copy</button>,
}))

import { ClusterAuthBadges, ClusterIAMRefreshHint } from './ClusterAuthBadges'

describe('ClusterAuthBadges', () => {
  it('renders auth badge for exec auth method', () => {
    const cluster: ClusterInfo = {
      name: 'test-cluster',
      context: 'test-context',
      server: 'https://test.example.com',
      authMethod: 'exec',
      healthy: true,
      namespaces: [],
      aliases: [],
    }
    const { getByText } = render(<ClusterAuthBadges cluster={cluster} className="badge" />)
    expect(getByText('IAM')).toBeTruthy()
  })

  it('renders auth badge for token auth method', () => {
    const cluster: ClusterInfo = {
      name: 'test-cluster',
      context: 'test-context',
      server: 'https://test.example.com',
      authMethod: 'token',
      healthy: true,
      namespaces: [],
      aliases: [],
    }
    const { getByText } = render(<ClusterAuthBadges cluster={cluster} className="badge" />)
    expect(getByText('token')).toBeTruthy()
  })

  it('renders auth badge for certificate auth method', () => {
    const cluster: ClusterInfo = {
      name: 'test-cluster',
      context: 'test-context',
      server: 'https://test.example.com',
      authMethod: 'certificate',
      healthy: true,
      namespaces: [],
      aliases: [],
    }
    const { getByText } = render(<ClusterAuthBadges cluster={cluster} className="badge" />)
    expect(getByText('cert')).toBeTruthy()
  })

  it('renders auth badge for auth-provider method', () => {
    const cluster: ClusterInfo = {
      name: 'test-cluster',
      context: 'test-context',
      server: 'https://test.example.com',
      authMethod: 'auth-provider',
      healthy: true,
      namespaces: [],
      aliases: [],
    }
    const { getByText } = render(<ClusterAuthBadges cluster={cluster} className="badge" />)
    expect(getByText('IAM')).toBeTruthy()
  })

  it('returns null for unsupported auth methods', () => {
    const cluster: ClusterInfo = {
      name: 'test-cluster',
      context: 'test-context',
      server: 'https://test.example.com',
      authMethod: 'unknown' as any,
      healthy: true,
      namespaces: [],
      aliases: [],
    }
    const { container } = render(<ClusterAuthBadges cluster={cluster} className="badge" />)
    expect(container.firstChild).toBeNull()
  })

  it('returns null when auth method is not specified', () => {
    const cluster: ClusterInfo = {
      name: 'test-cluster',
      context: 'test-context',
      server: 'https://test.example.com',
      healthy: true,
      namespaces: [],
      aliases: [],
    }
    const { container } = render(<ClusterAuthBadges cluster={cluster} className="badge" />)
    expect(container.firstChild).toBeNull()
  })

  it('applies custom className', () => {
    const cluster: ClusterInfo = {
      name: 'test-cluster',
      context: 'test-context',
      server: 'https://test.example.com',
      authMethod: 'token',
      healthy: true,
      namespaces: [],
      aliases: [],
    }
    const { container } = render(<ClusterAuthBadges cluster={cluster} className="custom-badge" />)
    expect(container.querySelector('.custom-badge')).toBeTruthy()
  })
})

describe('ClusterIAMRefreshHint', () => {
  it('renders IAM refresh hint when token is expired and auth method is exec', () => {
    const cluster: ClusterInfo = {
      name: 'test-cluster',
      context: 'test-context',
      server: 'https://test.example.com',
      authMethod: 'exec',
      errorType: 'auth',
      healthy: false,
      namespaces: [],
      aliases: [],
    }
    const { getByText } = render(<ClusterIAMRefreshHint cluster={cluster} className="hint" />)
    expect(getByText('aws sso login')).toBeTruthy()
  })

  it('does not render when auth method is not exec', () => {
    const cluster: ClusterInfo = {
      name: 'test-cluster',
      context: 'test-context',
      server: 'https://test.example.com',
      authMethod: 'token',
      healthy: true,
      namespaces: [],
      aliases: [],
    }
    const { container } = render(<ClusterIAMRefreshHint cluster={cluster} className="hint" />)
    expect(container.firstChild).toBeNull()
  })

  it('does not render when cluster is reachable and token is not expired', () => {
    const cluster: ClusterInfo = {
      name: 'test-cluster',
      context: 'test-context',
      server: 'https://test.example.com',
      authMethod: 'exec',
      healthy: true,
      reachable: true,
      namespaces: [],
      aliases: [],
    }
    const { container } = render(<ClusterIAMRefreshHint cluster={cluster} className="hint" />)
    expect(container.firstChild).toBeNull()
  })

  it('renders custom label when provided', () => {
    const cluster: ClusterInfo = {
      name: 'test-cluster',
      context: 'test-context',
      server: 'https://test.example.com',
      authMethod: 'exec',
      errorType: 'auth',
      healthy: false,
      namespaces: [],
      aliases: [],
    }
    const { getByText } = render(<ClusterIAMRefreshHint cluster={cluster} className="hint" label="Refresh:" />)
    expect(getByText('Refresh:')).toBeTruthy()
  })

  it('omits label when label prop is null', () => {
    const cluster: ClusterInfo = {
      name: 'test-cluster',
      context: 'test-context',
      server: 'https://test.example.com',
      authMethod: 'exec',
      errorType: 'auth',
      healthy: false,
      namespaces: [],
      aliases: [],
    }
    const { queryByText, getByText } = render(<ClusterIAMRefreshHint cluster={cluster} className="hint" label={null} />)
    expect(queryByText('Login:')).toBeNull()
    expect(getByText('aws sso login')).toBeTruthy()
  })

  it('renders copy button', () => {
    const cluster: ClusterInfo = {
      name: 'test-cluster',
      context: 'test-context',
      server: 'https://test.example.com',
      authMethod: 'exec',
      errorType: 'auth',
      healthy: false,
      namespaces: [],
      aliases: [],
    }
    const { getByTestId } = render(<ClusterIAMRefreshHint cluster={cluster} className="hint" />)
    expect(getByTestId('copy-button')).toBeTruthy()
  })
})
