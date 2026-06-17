import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../analytics-core', () => ({
  send: vi.fn(),
  setAnalyticsUserProperties: vi.fn(),
  emitError: vi.fn(),
}))

vi.mock('../demoMode', () => ({
  isDemoMode: vi.fn(() => false),
}))

vi.mock('../analytics-session', () => ({
  getDeploymentType: vi.fn(() => 'localhost'),
}))

import { send, setAnalyticsUserProperties, emitError } from '../analytics-core'
import { isDemoMode } from '../demoMode'
import { getDeploymentType } from '../analytics-session'
import { CAPABILITY_TOOL_EXEC, CAPABILITY_CHAT } from '../analytics-types'
import * as analytics from '../analytics-events'

const mockSend = vi.mocked(send)
const mockSetProps = vi.mocked(setAnalyticsUserProperties)
const mockEmitError = vi.mocked(emitError)
const mockIsDemoMode = vi.mocked(isDemoMode)
const mockGetDeploymentType = vi.mocked(getDeploymentType)

describe('analytics-events/settings platform', () => {
  beforeEach(() => {
    mockSend.mockClear()
    mockSetProps.mockClear()
    mockEmitError.mockClear()
    mockIsDemoMode.mockClear()
    mockGetDeploymentType.mockClear()
    mockIsDemoMode.mockReturnValue(false)
    mockGetDeploymentType.mockReturnValue('localhost')
    localStorage.clear()
    sessionStorage.clear()
  })

  describe('Auth / Connection Failure Detection', () => {
    it('analytics.emitAgentTokenFailure delegates to throttled analytics.emitError with agent_token_failure category', () => {
      analytics.emitAgentTokenFailure('empty token from /api/agent/token')
      expect(mockEmitError).toHaveBeenCalledWith(
        'agent_token_failure',
        'empty token from /api/agent/token',
      )
    })

    it('analytics.emitAgentTokenFailure truncates reason to 100 characters', () => {
      const longReason = 'x'.repeat(150)
      analytics.emitAgentTokenFailure(longReason)
      expect(mockEmitError).toHaveBeenCalledWith(
        'agent_token_failure',
        'x'.repeat(100),
      )
    })

    it('analytics.emitWsAuthMissing delegates to throttled analytics.emitError with ws_auth_missing category and strips host', () => {
      analytics.emitWsAuthMissing('ws://127.0.0.1:8585/ws')
      expect(mockEmitError).toHaveBeenCalledWith(
        'ws_auth_missing',
        '/ws',
      )
    })

    it('analytics.emitSseAuthFailure delegates to throttled analytics.emitError with sse_auth_failure category and strips host', () => {
      analytics.emitSseAuthFailure('http://127.0.0.1:8585/pods/stream?cluster=test')
      expect(mockEmitError).toHaveBeenCalledWith(
        'sse_auth_failure',
        '/pods/stream?cluster=test',
      )
    })

    it('analytics.emitSessionRefreshFailure delegates to throttled analytics.emitError with session_refresh_failure category', () => {
      analytics.emitSessionRefreshFailure('network error')
      expect(mockEmitError).toHaveBeenCalledWith(
        'session_refresh_failure',
        'network error',
      )
    })

    it('analytics.emitSessionRefreshFailure truncates reason to 100 characters', () => {
      const longReason = 'a]'.repeat(75)
      analytics.emitSessionRefreshFailure(longReason)
      expect(mockEmitError).toHaveBeenCalledWith(
        'session_refresh_failure',
        longReason.slice(0, 100),
      )
    })
  })

  describe('kc-agent Connection', () => {
    it('analytics.emitAgentConnected sends version and cluster count', () => {
      analytics.emitAgentConnected('1.2.3', 5)
      expect(mockSend).toHaveBeenCalledWith('ksc_agent_connected', { agent_version: '1.2.3', cluster_count: 5 })
    })

    it('analytics.emitAgentDisconnected sends event', () => {
      analytics.emitAgentDisconnected()
      expect(mockSend).toHaveBeenCalledWith('ksc_agent_disconnected')
    })
  })

  describe('Cluster Inventory', () => {
    it('analytics.emitClusterInventory sends counts and distribution params', () => {
      analytics.emitClusterInventory({
        total: 10,
        healthy: 7,
        unhealthy: 2,
        unreachable: 1,
        distributions: { eks: 3, gke: 5, kind: 2 },
      })
      expect(mockSend).toHaveBeenCalledWith('ksc_cluster_inventory', {
        cluster_count: 10,
        healthy_count: 7,
        unhealthy_count: 2,
        unreachable_count: 1,
        dist_eks: 3,
        dist_gke: 5,
        dist_kind: 2,
      })
      expect(mockSetProps).toHaveBeenCalledWith({ cluster_count: '10' })
    })

    it('analytics.emitClusterInventory handles empty distributions', () => {
      analytics.emitClusterInventory({
        total: 0,
        healthy: 0,
        unhealthy: 0,
        unreachable: 0,
        distributions: {},
      })
      expect(mockSend).toHaveBeenCalledWith('ksc_cluster_inventory', {
        cluster_count: 0,
        healthy_count: 0,
        unhealthy_count: 0,
        unreachable_count: 0,
      })
    })
  })

  describe('Agent Provider Detection', () => {
    it('analytics.emitAgentProvidersDetected categorizes CLI and API providers', () => {
      analytics.emitAgentProvidersDetected([
        { name: 'claude', displayName: 'Claude', capabilities: CAPABILITY_TOOL_EXEC | CAPABILITY_CHAT },
        { name: 'openai', displayName: 'OpenAI', capabilities: CAPABILITY_CHAT },
        { name: 'copilot', displayName: 'Copilot', capabilities: CAPABILITY_TOOL_EXEC },
      ])
      expect(mockSend).toHaveBeenCalledWith('ksc_agent_providers_detected', {
        provider_count: 3,
        cli_providers: 'claude,copilot',
        api_providers: 'openai',
        cli_count: 2,
        api_count: 1,
      })
    })

    it('analytics.emitAgentProvidersDetected returns early for empty array', () => {
      analytics.emitAgentProvidersDetected([])
      expect(mockSend).not.toHaveBeenCalled()
    })

    it('analytics.emitAgentProvidersDetected returns early for null/undefined', () => {
      analytics.emitAgentProvidersDetected(null as unknown as [])
      expect(mockSend).not.toHaveBeenCalled()
    })

    it('analytics.emitAgentProvidersDetected shows none when no CLI providers', () => {
      analytics.emitAgentProvidersDetected([
        { name: 'openai', displayName: 'OpenAI', capabilities: CAPABILITY_CHAT },
      ])
      expect(mockSend).toHaveBeenCalledWith('ksc_agent_providers_detected', expect.objectContaining({
        cli_providers: 'none',
        api_providers: 'openai',
      }))
    })
  })

  describe('API Keys', () => {
    it('analytics.emitApiKeyConfigured sends provider', () => {
      analytics.emitApiKeyConfigured('anthropic')
      expect(mockSend).toHaveBeenCalledWith('ksc_api_key_configured', { provider: 'anthropic' })
    })

    it('analytics.emitApiKeyRemoved sends provider', () => {
      analytics.emitApiKeyRemoved('anthropic')
      expect(mockSend).toHaveBeenCalledWith('ksc_api_key_removed', { provider: 'anthropic' })
    })
  })

  describe('Install Command', () => {
    it('analytics.emitInstallCommandCopied sends source and command', () => {
      analytics.emitInstallCommandCopied('setup_quickstart', 'brew install kubestellar')
      expect(mockSend).toHaveBeenCalledWith('ksc_install_command_copied', {
        source: 'setup_quickstart',
        command: 'brew install kubestellar',
      })
    })
  })

  describe('Conversion Funnel', () => {
    it('analytics.emitConversionStep sends step number, name, and optional details', () => {
      analytics.emitConversionStep(3, 'agent', { method: 'binary' })
      expect(mockSend).toHaveBeenCalledWith('ksc_conversion_step', {
        step_number: 3,
        step_name: 'agent',
        method: 'binary',
      })
    })

    it('analytics.emitConversionStep works without details', () => {
      analytics.emitConversionStep(1, 'discovery')
      expect(mockSend).toHaveBeenCalledWith('ksc_conversion_step', {
        step_number: 1,
        step_name: 'discovery',
      })
    })
  })

  describe('Cluster Lifecycle', () => {
    it('analytics.emitClusterCreated sends cluster name and auth type', () => {
      analytics.emitClusterCreated('prod-us-east', 'kubeconfig')
      expect(mockSend).toHaveBeenCalledWith('ksc_cluster_created', { cluster_name: 'prod-us-east', auth_type: 'kubeconfig' })
    })

    it('analytics.emitGitHubConnected sends event', () => {
      analytics.emitGitHubConnected()
      expect(mockSend).toHaveBeenCalledWith('ksc_github_connected')
    })
  })

  describe('Cluster Admin', () => {
    it('analytics.emitClusterAction sends action and cluster name', () => {
      analytics.emitClusterAction('cordon', 'worker-1')
      expect(mockSend).toHaveBeenCalledWith('ksc_cluster_action', { action: 'cordon', cluster_name: 'worker-1' })
    })

    it('analytics.emitClusterStatsDrillDown sends stat type', () => {
      analytics.emitClusterStatsDrillDown('cpu_usage')
      expect(mockSend).toHaveBeenCalledWith('ksc_cluster_stats_drill_down', { stat_type: 'cpu_usage' })
    })
  })

  describe('Local Cluster', () => {
    it('analytics.emitLocalClusterCreated sends tool', () => {
      analytics.emitLocalClusterCreated('kind')
      expect(mockSend).toHaveBeenCalledWith('ksc_local_cluster_created', { tool: 'kind' })
    })
  })

  describe('Developer Session', () => {
    it('analytics.emitDeveloperSession fires event for localhost deployment', () => {
      mockGetDeploymentType.mockReturnValue('localhost')
      analytics.emitDeveloperSession()
      expect(mockSend).toHaveBeenCalledWith('ksc_developer_session', { deployment_type: 'localhost' })
    })

    it('analytics.emitDeveloperSession skips if already sent', () => {
      localStorage.setItem('ksc-dev-session-sent', '1')
      analytics.emitDeveloperSession()
      expect(mockSend).not.toHaveBeenCalled()
    })

    it('analytics.emitDeveloperSession skips for non-localhost deployment', () => {
      mockGetDeploymentType.mockReturnValue('console.kubestellar.io')
      analytics.emitDeveloperSession()
      expect(mockSend).not.toHaveBeenCalled()
    })

    it('analytics.emitDeveloperSession skips for demo mode without token', () => {
      mockIsDemoMode.mockReturnValue(true)
      analytics.emitDeveloperSession()
      expect(mockSend).not.toHaveBeenCalled()
    })

    it('analytics.emitDeveloperSession fires for demo mode with token', () => {
      mockIsDemoMode.mockReturnValue(true)
      localStorage.setItem('ksc-token', 'test-token')
      analytics.emitDeveloperSession()
      expect(mockSend).toHaveBeenCalledWith('ksc_developer_session', { deployment_type: 'localhost' })
    })
  })

})
