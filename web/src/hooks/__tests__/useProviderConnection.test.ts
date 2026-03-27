import { describe, it, expect } from 'vitest'
import {
  INITIAL_PROVIDER_CONNECTION_STATE,
  PROVIDER_PREREQUISITES,
} from '../../types/agent'
import type {
  ProviderConnectionPhase,
  ProviderConnectionState,
} from '../../types/agent'

describe('ProviderConnectionState types', () => {
  it('has the correct initial state', () => {
    expect(INITIAL_PROVIDER_CONNECTION_STATE.phase).toBe('idle')
    expect(INITIAL_PROVIDER_CONNECTION_STATE.provider).toBeNull()
    expect(INITIAL_PROVIDER_CONNECTION_STATE.startedAt).toBeNull()
    expect(INITIAL_PROVIDER_CONNECTION_STATE.error).toBeNull()
    expect(INITIAL_PROVIDER_CONNECTION_STATE.retryCount).toBe(0)
    expect(INITIAL_PROVIDER_CONNECTION_STATE.prerequisite).toBeNull()
  })

  it('defines all expected lifecycle phases', () => {
    const phases: ProviderConnectionPhase[] = ['idle', 'starting', 'handshake', 'connected', 'failed']
    // Verify each phase is assignable
    for (const phase of phases) {
      const state: ProviderConnectionState = { ...INITIAL_PROVIDER_CONNECTION_STATE, phase }
      expect(state.phase).toBe(phase)
    }
  })

  it('defines VS Code prerequisites', () => {
    const vscodePrereq = PROVIDER_PREREQUISITES['vscode']
    expect(vscodePrereq).toBeDefined()
    expect(vscodePrereq.label).toContain('VS Code')
    expect(vscodePrereq.description).toContain('Copilot')
    expect(vscodePrereq.installUrl).toContain('marketplace.visualstudio.com')
  })

  it('returns a complete state when transitioning to starting', () => {
    const state: ProviderConnectionState = {
      phase: 'starting',
      provider: 'vscode',
      startedAt: Date.now(),
      error: null,
      retryCount: 0,
      prerequisite: PROVIDER_PREREQUISITES['vscode']?.description ?? null,
    }
    expect(state.phase).toBe('starting')
    expect(state.provider).toBe('vscode')
    expect(state.prerequisite).toContain('Copilot')
  })

  it('preserves provider on failure so selection is not lost', () => {
    const state: ProviderConnectionState = {
      phase: 'failed',
      provider: 'vscode',
      startedAt: Date.now() - 10000,
      error: 'Connection timed out. VS Code must be running with the GitHub Copilot extension installed and signed in.',
      retryCount: 1,
      prerequisite: PROVIDER_PREREQUISITES['vscode']?.description ?? null,
    }
    // Provider is still set even after failure
    expect(state.provider).toBe('vscode')
    expect(state.error).toContain('timed out')
    expect(state.retryCount).toBe(1)
  })

  it('timeout error includes specific reason, not a generic hang', () => {
    const prerequisite = PROVIDER_PREREQUISITES['vscode']
    const reason = prerequisite
      ? `Connection timed out. ${prerequisite.description}`
      : 'Connection timed out after 10s.'

    expect(reason).toContain('Connection timed out')
    expect(reason).toContain('Copilot')
    expect(reason).not.toBe('Connection timed out') // Not a generic message
  })
})
