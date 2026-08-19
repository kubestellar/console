import React from 'react'
/// <reference types='@testing-library/jest-dom/vitest' />
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('./AgentIcon', () => ({
  AgentIcon: ({ provider }: { provider: string }) => <div data-testid={`agent-icon-${provider}`} />,
}))

import { ProviderKeyForm } from './ProviderKeyForm'
import type { KeyStatus } from './apiKeySettingsTypes'

const translations: Record<string, string> = {
  'agent.working': 'Working',
  'agent.invalid': 'Invalid',
  'agent.configured': 'Configured',
  'agent.notConfigured': 'Not configured',
  'agent.fromEnv': 'from env',
  'agent.removeKey': 'Remove key',
  'agent.getApiKey': 'Get API key',
  'agent.enterApiKey': 'Enter API key',
  'agent.saveAndValidate': 'Save and validate',
  'actions.cancel': 'Cancel',
  'agent.updateKey': 'Update key',
  'agent.addKey': 'Add key',
  'agent.envVariableNote': 'Configured via environment variable',
  'agent.advanced': 'Advanced',
  'agent.baseUrlLabel': 'Base URL',
  'agent.baseUrlHint': 'Override the endpoint',
  'agent.saveBaseUrl': 'Save Base URL',
  'agent.baseUrlRestartHint': 'Saved. Restart kc-agent for the change to take effect.',
  'agent.baseUrlFromEnv': 'env var set',
}
const t = ((key: string) => translations[key] ?? key) as unknown as import('i18next').TFunction

const baseKeyStatus: KeyStatus = {
  provider: 'openrouter',
  displayName: 'OpenRouter',
  configured: false,
}

function makeProps(overrides: Partial<React.ComponentProps<typeof ProviderKeyForm>> = {}) {
  return {
    keyStatus: baseKeyStatus,
    editingProvider: null,
    newKeyValue: '',
    showKey: false,
    saving: false,
    editError: null,
    expandedAdvanced: new Set<string>(),
    baseURLDraft: {},
    baseURLSaved: new Set<string>(),
    baseURLError: {},
    t,
    onStartEditing: vi.fn(),
    onCancelEditing: vi.fn(),
    onSetDeleteConfirmProvider: vi.fn(),
    onSetNewKeyValue: vi.fn(),
    onSetShowKey: vi.fn(),
    onSetEditError: vi.fn(),
    onSaveKey: vi.fn(),
    onToggleAdvanced: vi.fn(),
    onSetBaseURLDraft: vi.fn(),
    onSaveBaseURL: vi.fn(),
    getApiKeyErrorMessage: vi.fn((message: string) => message),
    ...overrides,
  }
}

describe('ProviderKeyForm', () => {
  it('renders without crashing', () => {
    expect(() => render(<ProviderKeyForm {...makeProps()} />)).not.toThrow()
  })

  it('shows "Not configured" and an "Add key" button when the key is not configured', () => {
    render(<ProviderKeyForm {...makeProps()} />)
    expect(screen.getByText('Not configured')).toBeInTheDocument()
    expect(screen.getByText('Add key')).toBeInTheDocument()
  })

  it('shows "Update key" when the key is configured', () => {
    render(<ProviderKeyForm {...makeProps({ keyStatus: { ...baseKeyStatus, configured: true } })} />)
    expect(screen.getByText('Update key')).toBeInTheDocument()
  })

  it('shows a "Working" status when the key is configured and valid', () => {
    render(<ProviderKeyForm {...makeProps({ keyStatus: { ...baseKeyStatus, configured: true, valid: true } })} />)
    expect(screen.getByText('Working')).toBeInTheDocument()
  })

  it('shows an "Invalid" status when the key is configured but invalid', () => {
    render(<ProviderKeyForm {...makeProps({ keyStatus: { ...baseKeyStatus, configured: true, valid: false } })} />)
    expect(screen.getByText('Invalid')).toBeInTheDocument()
  })

  it('disables the "Update key" button and hides delete when the key comes from an env var', () => {
    render(<ProviderKeyForm {...makeProps({ keyStatus: { ...baseKeyStatus, configured: true, source: 'env' } })} />)
    expect(screen.getByText('Update key').closest('button')).toBeDisabled()
    expect(screen.getByText('Configured via environment variable')).toBeInTheDocument()
    expect(screen.queryByTitle('Remove key')).not.toBeInTheDocument()
  })

  it('renders a delete button for a configured, non-env key and calls onSetDeleteConfirmProvider on click', () => {
    const onSetDeleteConfirmProvider = vi.fn()
    render(
      <ProviderKeyForm
        {...makeProps({
          keyStatus: { ...baseKeyStatus, configured: true, source: 'config' },
          onSetDeleteConfirmProvider,
        })}
      />,
    )
    fireEvent.click(screen.getByTitle('Remove key'))
    expect(onSetDeleteConfirmProvider).toHaveBeenCalledWith('openrouter')
  })

  it('calls onStartEditing when the add/update button is clicked', () => {
    const onStartEditing = vi.fn()
    render(<ProviderKeyForm {...makeProps({ onStartEditing })} />)
    fireEvent.click(screen.getByText('Add key'))
    expect(onStartEditing).toHaveBeenCalledWith('openrouter')
  })

  it('shows the key input and toggles between password and text when editing', () => {
    render(<ProviderKeyForm {...makeProps({ editingProvider: 'openrouter', newKeyValue: 'sk-or-abc', showKey: false })} />)
    const input = screen.getByPlaceholderText('sk-or-...') as HTMLInputElement
    expect(input.type).toBe('password')
  })

  it('shows the key input as text when showKey is true', () => {
    render(<ProviderKeyForm {...makeProps({ editingProvider: 'openrouter', newKeyValue: 'sk-or-abc', showKey: true })} />)
    const input = screen.getByPlaceholderText('sk-or-...') as HTMLInputElement
    expect(input.type).toBe('text')
  })

  it('calls onSetShowKey to toggle visibility when the eye icon is clicked', () => {
    const onSetShowKey = vi.fn()
    render(<ProviderKeyForm {...makeProps({ editingProvider: 'openrouter', newKeyValue: 'sk-or-abc', showKey: false, onSetShowKey })} />)
    const toggleButtons = screen.getAllByRole('button')
    const eyeButton = toggleButtons.find(b => b.getAttribute('type') === 'button' && !b.textContent)
    fireEvent.click(eyeButton!)
    expect(onSetShowKey).toHaveBeenCalledWith(true)
  })

  it('disables the save button when newKeyValue is empty', () => {
    render(<ProviderKeyForm {...makeProps({ editingProvider: 'openrouter', newKeyValue: '' })} />)
    expect(screen.getByText('Save and validate').closest('button')).toBeDisabled()
  })

  it('disables the save button while saving', () => {
    render(<ProviderKeyForm {...makeProps({ editingProvider: 'openrouter', newKeyValue: 'sk-or-abc', saving: true })} />)
    const saveButton = screen.getAllByRole('button').find(b => b.querySelector('.animate-spin'))
    expect(saveButton).toBeDisabled()
  })

  it('calls onSaveKey with the provider when save is clicked', () => {
    const onSaveKey = vi.fn()
    render(<ProviderKeyForm {...makeProps({ editingProvider: 'openrouter', newKeyValue: 'sk-or-abc', onSaveKey })} />)
    fireEvent.click(screen.getByText('Save and validate'))
    expect(onSaveKey).toHaveBeenCalledWith('openrouter')
  })

  it('calls onCancelEditing when cancel is clicked', () => {
    const onCancelEditing = vi.fn()
    render(<ProviderKeyForm {...makeProps({ editingProvider: 'openrouter', newKeyValue: 'sk-or-abc', onCancelEditing })} />)
    fireEvent.click(screen.getByText('Cancel'))
    expect(onCancelEditing).toHaveBeenCalledTimes(1)
  })

  it('renders editError inline', () => {
    render(<ProviderKeyForm {...makeProps({ editingProvider: 'openrouter', newKeyValue: 'sk-or-abc', editError: 'invalid_api_key' })} />)
    expect(screen.getByText('invalid_api_key')).toBeInTheDocument()
  })

  it('does not render the advanced section when the provider has no baseURLEnvVar', () => {
    render(<ProviderKeyForm {...makeProps()} />)
    expect(screen.queryByText('Advanced')).not.toBeInTheDocument()
  })

  it('renders the advanced toggle when the provider has a baseURLEnvVar', () => {
    render(
      <ProviderKeyForm
        {...makeProps({ keyStatus: { ...baseKeyStatus, provider: 'ollama', baseURLEnvVar: 'OLLAMA_URL' } })}
      />,
    )
    expect(screen.getByText('Advanced')).toBeInTheDocument()
  })

  it('expands the advanced base-URL section and calls onToggleAdvanced with the current baseURL', () => {
    const onToggleAdvanced = vi.fn()
    render(
      <ProviderKeyForm
        {...makeProps({
          keyStatus: { ...baseKeyStatus, provider: 'ollama', baseURLEnvVar: 'OLLAMA_URL', baseURL: 'http://localhost:11434' },
          onToggleAdvanced,
        })}
      />,
    )
    fireEvent.click(screen.getByText('Advanced'))
    expect(onToggleAdvanced).toHaveBeenCalledWith('ollama', 'http://localhost:11434')
  })

  it('shows baseURLError inline when the advanced section is expanded', () => {
    render(
      <ProviderKeyForm
        {...makeProps({
          keyStatus: { ...baseKeyStatus, provider: 'ollama', baseURLEnvVar: 'OLLAMA_URL' },
          expandedAdvanced: new Set(['ollama']),
          baseURLError: { ollama: 'Invalid URL' },
        })}
      />,
    )
    expect(screen.getByText('Invalid URL')).toBeInTheDocument()
  })

  it('calls onSaveBaseURL with the provider when Save Base URL is clicked', () => {
    const onSaveBaseURL = vi.fn()
    render(
      <ProviderKeyForm
        {...makeProps({
          keyStatus: { ...baseKeyStatus, provider: 'ollama', baseURLEnvVar: 'OLLAMA_URL' },
          expandedAdvanced: new Set(['ollama']),
          onSaveBaseURL,
        })}
      />,
    )
    fireEvent.click(screen.getByText('Save Base URL'))
    expect(onSaveBaseURL).toHaveBeenCalledWith('ollama')
  })

  it('disables the base-URL input and save button when baseURLSource is env', () => {
    render(
      <ProviderKeyForm
        {...makeProps({
          keyStatus: { ...baseKeyStatus, provider: 'ollama', baseURLEnvVar: 'OLLAMA_URL', baseURLSource: 'env' },
          expandedAdvanced: new Set(['ollama']),
        })}
      />,
    )
    expect(screen.getByText('Save Base URL').closest('button')).toBeDisabled()
  })
})
