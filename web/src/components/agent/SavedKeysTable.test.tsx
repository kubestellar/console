import React from 'react'
/// <reference types='@testing-library/jest-dom/vitest' />
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const translations: Record<string, string> = {
  'agent.working': 'Working',
  'agent.configured': 'Configured',
  'agent.notConfigured': 'Not configured',
  'agent.removeKey': 'Remove key',
  'agent.getApiKey': 'Get API key',
  'agent.enterApiKey': 'Enter API key',
  'agent.saveAndValidate': 'Save and validate',
  'actions.cancel': 'Cancel',
  'actions.delete': 'Delete',
  'agent.updateKey': 'Update key',
  'agent.addKey': 'Add key',
  'agent.keysSavedTo': 'Keys saved to',
  'agent.failedToSaveKey': 'Failed to save key',
  'agent.failedToDeleteKey': 'Failed to delete key',
  'agent.validationFailedModel': 'Validation failed: model not found',
  'agent.invalidApiKey': 'Invalid API key',
  'agent.rateLimitExceeded': 'Rate limit exceeded',
  'agent.failedToValidate': 'Failed to validate key',
  'dashboard.delete.warning': 'This action cannot be undone.',
}

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => translations[key] ?? key, i18n: { language: 'en' } }),
}))

vi.mock('./AgentIcon', () => ({
  AgentIcon: ({ provider }: { provider: string }) => <div data-testid={`agent-icon-${provider}`} />,
}))

const { emitApiKeyConfigured, emitApiKeyRemoved, emitConversionStep } = vi.hoisted(() => ({
  emitApiKeyConfigured: vi.fn(),
  emitApiKeyRemoved: vi.fn(),
  emitConversionStep: vi.fn(),
}))
vi.mock('../../lib/analytics', () => ({ emitApiKeyConfigured, emitApiKeyRemoved, emitConversionStep }))

let confirmDialogProps: { isOpen: boolean; onConfirm: () => void; onClose: () => void; message?: React.ReactNode; isLoading?: boolean } | null = null
vi.mock('../../lib/modals', () => ({
  ConfirmDialog: (props: { isOpen: boolean; onConfirm: () => void; onClose: () => void; message?: React.ReactNode; isLoading?: boolean }) => {
    confirmDialogProps = props
    if (!props.isOpen) return null
    return (
      <div data-testid="confirm-dialog">
        <button onClick={props.onConfirm}>confirm</button>
        <button onClick={props.onClose}>cancel</button>
        <span data-testid="confirm-loading">{String(Boolean(props.isLoading))}</span>
      </div>
    )
  },
}))

import { SavedKeysTable } from './SavedKeysTable'
import type { KeyStatus, RegisteredProvider } from './apiKeySettingsTypes'

const openrouterKey: KeyStatus = {
  provider: 'openrouter',
  displayName: 'OpenRouter',
  configured: false,
}
const groqKey: KeyStatus = {
  provider: 'groq',
  displayName: 'Groq',
  configured: true,
  valid: true,
  source: 'config',
}

const registeredProviders: RegisteredProvider[] = [
  { name: 'openrouter', displayName: 'OpenRouter', description: '', provider: 'openrouter', available: true, capabilities: 1 },
  { name: 'groq', displayName: 'Groq', description: '', provider: 'groq', available: true, capabilities: 1 },
]

function makeProps(overrides: Partial<React.ComponentProps<typeof SavedKeysTable>> = {}) {
  return {
    keysStatus: [openrouterKey, groqKey],
    registeredProviders,
    configPath: '/home/user/.kc-agent/config.json',
    initialError: null,
    onRefresh: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

describe('SavedKeysTable', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    confirmDialogProps = null
    globalThis.fetch = vi.fn()
  })

  it('renders without crashing', () => {
    expect(() => render(<SavedKeysTable {...makeProps()} />)).not.toThrow()
  })

  it('renders one row per key status', () => {
    render(<SavedKeysTable {...makeProps()} />)
    expect(screen.getByText('OpenRouter')).toBeInTheDocument()
    expect(screen.getByText('Groq')).toBeInTheDocument()
  })

  it('renders the correct provider icon for each key', () => {
    render(<SavedKeysTable {...makeProps()} />)
    expect(screen.getByTestId('agent-icon-openrouter')).toBeInTheDocument()
    expect(screen.getByTestId('agent-icon-groq')).toBeInTheDocument()
  })

  it('filters keys down to registered providers only', () => {
    const customKey: KeyStatus = { provider: 'custom', displayName: 'Custom Provider', configured: false }
    render(<SavedKeysTable {...makeProps({ keysStatus: [openrouterKey, groqKey, customKey] })} />)
    expect(screen.queryByText('Custom Provider')).not.toBeInTheDocument()
  })

  it('shows all keys when registeredProviders is empty', () => {
    const customKey: KeyStatus = { provider: 'custom', displayName: 'Custom Provider', configured: false }
    render(<SavedKeysTable {...makeProps({ keysStatus: [customKey], registeredProviders: [] })} />)
    expect(screen.getByText('Custom Provider')).toBeInTheDocument()
  })

  it('renders the configPath footer when provided', () => {
    render(<SavedKeysTable {...makeProps()} />)
    expect(screen.getByText('/home/user/.kc-agent/config.json')).toBeInTheDocument()
  })

  it('does not render the configPath footer when empty', () => {
    render(<SavedKeysTable {...makeProps({ configPath: '' })} />)
    expect(screen.queryByText('Keys saved to')).not.toBeInTheDocument()
  })

  it('renders the initialError message', () => {
    render(<SavedKeysTable {...makeProps({ initialError: 'invalid_api_key' })} />)
    expect(screen.getByText('Invalid API key')).toBeInTheDocument()
  })

  it('starts editing a key and saves it via the kc-agent API, then calls onRefresh', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({ ok: true, json: async () => ({}) } as Response)
    const onRefresh = vi.fn().mockResolvedValue(undefined)
    render(<SavedKeysTable {...makeProps({ onRefresh })} />)

    fireEvent.click(screen.getByText('Add key'))
    const input = screen.getByPlaceholderText('sk-or-...')
    fireEvent.change(input, { target: { value: 'sk-or-newkey' } })
    fireEvent.click(screen.getByText('Save and validate'))

    await waitFor(() => expect(onRefresh).toHaveBeenCalled())
    expect(emitApiKeyConfigured).toHaveBeenCalledWith('openrouter')
    expect(emitConversionStep).toHaveBeenCalledWith(5, 'api_key', { provider: 'openrouter' })
  })

  it('shows an inline error and does not call onRefresh when saving a key fails', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: false,
      json: async () => ({ message: 'invalid_api_key' }),
    } as Response)
    const onRefresh = vi.fn().mockResolvedValue(undefined)
    render(<SavedKeysTable {...makeProps({ onRefresh })} />)

    fireEvent.click(screen.getByText('Add key'))
    fireEvent.change(screen.getByPlaceholderText('sk-or-...'), { target: { value: 'sk-or-badkey' } })
    fireEvent.click(screen.getByText('Save and validate'))

    expect(await screen.findByText('Invalid API key')).toBeInTheDocument()
    expect(onRefresh).not.toHaveBeenCalled()
  })

  it('opens the delete-confirm dialog when the remove-key button is clicked', () => {
    render(<SavedKeysTable {...makeProps()} />)
    fireEvent.click(screen.getByTitle('Remove key'))
    expect(confirmDialogProps?.isOpen).toBe(true)
  })

  it('deletes the key and calls onRefresh when the delete is confirmed', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({ ok: true, json: async () => ({}) } as Response)
    const onRefresh = vi.fn().mockResolvedValue(undefined)
    render(<SavedKeysTable {...makeProps({ onRefresh })} />)

    fireEvent.click(screen.getByTitle('Remove key'))
    fireEvent.click(screen.getByText('confirm'))

    await waitFor(() => expect(onRefresh).toHaveBeenCalled())
    expect(emitApiKeyRemoved).toHaveBeenCalledWith('groq')
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/settings/keys/groq'),
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  it('shows loading state while delete request is in progress', async () => {
    let resolveDelete: (() => void) | null = null
    const pendingDelete = new Promise<Response>((resolve) => {
      resolveDelete = () => resolve({ ok: true, json: async () => ({}) } as Response)
    })
    vi.mocked(globalThis.fetch).mockReturnValue(pendingDelete)

    render(<SavedKeysTable {...makeProps()} />)
    fireEvent.click(screen.getByTitle('Remove key'))
    fireEvent.click(screen.getByText('confirm'))

    expect(screen.getByTestId('confirm-loading')).toHaveTextContent('true')
    resolveDelete?.()
    await waitFor(() => expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument())
  })
})
