import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import * as APIKeySettingsModule from './APIKeySettings'
import { APIKeySettings, buildBaseURLPayload } from './APIKeySettings'

const translations: Record<string, string> = {
  'agent.apiKeySettings': 'API Key Settings',
  'agent.noProvidersTitle': 'No API Providers Available',
  'agent.noProvidersDescription': 'API keys for cloud AI providers are configured via environment variables. Set the variables below and restart the console to enable AI features.',
  'agent.envVarsTitle': 'Environment Variables',
  'agent.envVarsHint': 'Set these in your .env file or shell environment, then restart the console.',
  'agent.retryConnection': 'Retry Connection',
  'agent.securityNote': 'Security note',
}

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => translations[key] ?? key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}))

vi.mock('../../lib/modals', () => {
  const Header = ({ title }: { title: string }) => <h2>{title}</h2>
  const Content = ({ children }: { children: React.ReactNode }) => <div>{children}</div>
  const Footer = ({ children }: { children: React.ReactNode }) => <div>{children}</div>
  const BaseModal = ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) => {
    if (!isOpen) return null
    return <div data-testid="api-key-settings-modal">{children}</div>
  }
  BaseModal.Header = Header
  BaseModal.Content = Content
  BaseModal.Footer = Footer

  return {
    BaseModal,
    ConfirmDialog: () => null,
  }
})

vi.mock('./AgentIcon', () => ({
  AgentIcon: ({ provider }: { provider: string }) => <div data-testid={`agent-icon-${provider}`} />,
}))

vi.mock('../../lib/analytics', () => ({
  emitApiKeyConfigured: vi.fn(),
  emitApiKeyRemoved: vi.fn(),
  emitConversionStep: vi.fn(),
}))

vi.mock('../../lib/clipboard', () => ({
  copyToClipboard: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../config/externalApis', () => ({
  KC_AGENT: {
    installCommand: 'brew install kc-agent',
    url: 'http://127.0.0.1:8585',
  },
  AI_PROVIDER_DOCS: {},
}))

describe('APIKeySettings Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    globalThis.fetch = vi.fn()
  })

  it('exports APIKeySettings component', () => {
    expect(APIKeySettingsModule.APIKeySettings).toBeDefined()
    expect(typeof APIKeySettingsModule.APIKeySettings).toBe('function')
  })

  it('shows the empty state when no providers are available after filtering', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        keys: [{ provider: 'custom', displayName: 'Custom', configured: false }],
        registeredProviders: [{ name: 'other', displayName: 'Other', description: '', provider: 'other', available: true, capabilities: 0 }],
        configPath: '',
      }),
    } as Response)

    render(<APIKeySettings isOpen={true} onClose={vi.fn()} />)

    expect(await screen.findByText('No API Providers Available')).toBeInTheDocument()
    expect(screen.getByText('Environment Variables')).toBeInTheDocument()
    expect(screen.getByText('ANTHROPIC_API_KEY=sk-ant-...')).toBeInTheDocument()
    expect(screen.getByText('OPENAI_API_KEY=sk-...')).toBeInTheDocument()
    expect(screen.getByText('GEMINI_API_KEY=...')).toBeInTheDocument()
    expect(screen.queryByText('Custom')).not.toBeInTheDocument()
  })

  it('retries fetching provider data from the empty state', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ keys: [], registeredProviders: [], configPath: '' }),
    } as Response)

    render(<APIKeySettings isOpen={true} onClose={vi.fn()} />)

    const retryButton = await screen.findByRole('button', { name: 'Retry Connection' })
    const initialCalls = vi.mocked(globalThis.fetch).mock.calls.length

    fireEvent.click(retryButton)

    await waitFor(() => {
      expect(vi.mocked(globalThis.fetch).mock.calls.length).toBeGreaterThan(initialCalls)
    })
  })
})

describe('buildBaseURLPayload', () => {
  it('sends clearBaseURL:true and omits baseURL when draft is empty (#8277)', () => {
    const body = buildBaseURLPayload('ollama', '')
    expect(body).toEqual({ provider: 'ollama', clearBaseURL: true })
    expect('baseURL' in body).toBe(false)
  })

  it('sends baseURL and omits clearBaseURL when draft is non-empty', () => {
    const body = buildBaseURLPayload('ollama', 'http://localhost:11434')
    expect(body).toEqual({ provider: 'ollama', baseURL: 'http://localhost:11434' })
    expect('clearBaseURL' in body).toBe(false)
  })
})
