import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ProviderKeyForm } from './ProviderKeyForm'
import type { KeyStatus } from './apiKeySettingsTypes'

vi.mock('./AgentIcon', () => ({
  AgentIcon: ({ provider }: { provider: string }) => <div data-testid={`agent-icon-${provider}`} />,
}))

vi.mock('../../config/externalApis', () => ({
  AI_PROVIDER_DOCS: {
    openai: 'https://platform.openai.com/api-keys',
    anthropic: 'https://console.anthropic.com/settings/keys',
  },
}))

const t = (key: string, fallback?: string) => fallback ?? key

function baseKeyStatus(overrides: Partial<KeyStatus> = {}): KeyStatus {
  return {
    provider: 'openai',
    displayName: 'OpenAI',
    configured: false,
    ...overrides,
  }
}

function baseProps(overrides: Partial<React.ComponentProps<typeof ProviderKeyForm>> = {}) {
  return {
    keyStatus: baseKeyStatus(),
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
    getApiKeyErrorMessage: (msg: string) => msg,
    ...overrides,
  }
}

describe('ProviderKeyForm', () => {
  it('renders provider display name', () => {
    render(<ProviderKeyForm {...baseProps()} />)
    expect(screen.getByText('OpenAI')).toBeTruthy()
  })

  it('shows not-configured label when key is absent', () => {
    render(<ProviderKeyForm {...baseProps()} />)
    expect(screen.getByText('agent.notConfigured')).toBeTruthy()
  })

  it('shows configured + working label when key is valid', () => {
    render(
      <ProviderKeyForm
        {...baseProps({ keyStatus: baseKeyStatus({ configured: true, valid: true }) })}
      />
    )
    expect(screen.getByText('agent.working')).toBeTruthy()
  })

  it('shows invalid label when key is invalid', () => {
    render(
      <ProviderKeyForm
        {...baseProps({ keyStatus: baseKeyStatus({ configured: true, valid: false }) })}
      />
    )
    expect(screen.getByText('agent.invalid')).toBeTruthy()
  })

  it('calls onStartEditing when Add Key button is clicked', () => {
    const onStartEditing = vi.fn()
    render(<ProviderKeyForm {...baseProps({ onStartEditing })} />)
    fireEvent.click(screen.getByText('agent.addKey'))
    expect(onStartEditing).toHaveBeenCalledWith('openai')
  })

  it('calls onStartEditing with Update Key label when configured', () => {
    const onStartEditing = vi.fn()
    render(
      <ProviderKeyForm
        {...baseProps({
          keyStatus: baseKeyStatus({ configured: true, valid: true }),
          onStartEditing,
        })}
      />
    )
    fireEvent.click(screen.getByText('agent.updateKey'))
    expect(onStartEditing).toHaveBeenCalledWith('openai')
  })

  it('renders key input when editing this provider', () => {
    render(
      <ProviderKeyForm {...baseProps({ editingProvider: 'openai' })} />
    )
    expect(screen.getByRole('textbox')).toBeTruthy()
  })

  it('calls onSetNewKeyValue when user types in key input', () => {
    const onSetNewKeyValue = vi.fn()
    render(
      <ProviderKeyForm {...baseProps({ editingProvider: 'openai', onSetNewKeyValue })} />
    )
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'sk-test' } })
    expect(onSetNewKeyValue).toHaveBeenCalledWith('sk-test')
  })

  it('calls onSetShowKey when eye button is toggled', () => {
    const onSetShowKey = vi.fn()
    render(
      <ProviderKeyForm {...baseProps({ editingProvider: 'openai', onSetShowKey })} />
    )
    const eyeBtn = screen.getByRole('button', { name: '' })
    // find the toggle button (not Save/Cancel)
    const allButtons = screen.getAllByRole('button')
    const eyeToggle = allButtons.find(
      (b) => !b.textContent?.includes('agent.') && b.getAttribute('type') === 'button'
    )
    expect(eyeToggle).toBeTruthy()
    fireEvent.click(eyeToggle!)
    expect(onSetShowKey).toHaveBeenCalledWith(true)
  })

  it('calls onSaveKey when Save button is clicked with non-empty key', () => {
    const onSaveKey = vi.fn()
    render(
      <ProviderKeyForm
        {...baseProps({ editingProvider: 'openai', newKeyValue: 'sk-test', onSaveKey })}
      />
    )
    fireEvent.click(screen.getByText('agent.saveAndValidate'))
    expect(onSaveKey).toHaveBeenCalledWith('openai')
  })

  it('Save button is disabled when key value is empty', () => {
    render(
      <ProviderKeyForm {...baseProps({ editingProvider: 'openai', newKeyValue: '' })} />
    )
    const saveBtn = screen.getByText('agent.saveAndValidate').closest('button')
    expect(saveBtn?.disabled).toBe(true)
  })

  it('calls onCancelEditing when Cancel is clicked', () => {
    const onCancelEditing = vi.fn()
    render(
      <ProviderKeyForm
        {...baseProps({ editingProvider: 'openai', newKeyValue: 'x', onCancelEditing })}
      />
    )
    fireEvent.click(screen.getByText('actions.cancel'))
    expect(onCancelEditing).toHaveBeenCalled()
  })

  it('displays edit error message when present', () => {
    render(
      <ProviderKeyForm
        {...baseProps({
          editingProvider: 'openai',
          newKeyValue: 'x',
          editError: 'Invalid API key',
        })}
      />
    )
    expect(screen.getByText('Invalid API key')).toBeTruthy()
  })

  it('calls onSetDeleteConfirmProvider when delete button is clicked', () => {
    const onSetDeleteConfirmProvider = vi.fn()
    render(
      <ProviderKeyForm
        {...baseProps({
          keyStatus: baseKeyStatus({ configured: true, valid: true, source: 'config' }),
          onSetDeleteConfirmProvider,
        })}
      />
    )
    const deleteBtn = screen.getByTitle('agent.removeKey')
    fireEvent.click(deleteBtn)
    expect(onSetDeleteConfirmProvider).toHaveBeenCalledWith('openai')
  })

  it('Add Key button is disabled when source is env', () => {
    render(
      <ProviderKeyForm
        {...baseProps({
          keyStatus: baseKeyStatus({ configured: true, source: 'env' }),
        })}
      />
    )
    const btn = screen.getByText('agent.updateKey').closest('button')
    expect(btn?.disabled).toBe(true)
  })

  it('shows env variable note when source is env', () => {
    render(
      <ProviderKeyForm
        {...baseProps({
          keyStatus: baseKeyStatus({ configured: true, source: 'env' }),
        })}
      />
    )
    expect(screen.getByText('agent.envVariableNote')).toBeTruthy()
  })
})
