import { describe, it, expect } from 'vitest'
import { buildVisibleAgents, sectionAgents, CLUSTER_PROVIDER_KEYS } from '../agentSelectorUtils'
import type { AgentInfo } from '../../../types/agent'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAgent(name: string, provider: AgentInfo['provider'], available = true): AgentInfo {
  return { name, displayName: name, description: '', provider, available }
}

const CLUSTER_PROVIDERS = new Set(CLUSTER_PROVIDER_KEYS)

const GEMINI_AGENT = { name: 'gemini-kagenti-agent' }
const MOCK_AGENT = { name: 'mock-kagenti-agent' }

// ---------------------------------------------------------------------------
// buildVisibleAgents — kagenti mode
// ---------------------------------------------------------------------------

describe('buildVisibleAgents — kagenti mode', () => {
  it('adds kagenti to visible agents when available', () => {
    const result = buildVisibleAgents([], [], {
      kagentAvailable: false,
      kagentiAvailable: true,
      selectedKagentAgent: null,
      selectedKagentiAgent: GEMINI_AGENT,
    })
    const kagenti = result.find(a => a.provider === 'kagenti')
    expect(kagenti).toBeDefined()
    expect(kagenti?.available).toBe(true)
  })

  it('shows kagenti display name with selected agent name when an agent is selected', () => {
    const result = buildVisibleAgents([], [], {
      kagentAvailable: false,
      kagentiAvailable: true,
      selectedKagentAgent: null,
      selectedKagentiAgent: GEMINI_AGENT,
    })
    const kagenti = result.find(a => a.provider === 'kagenti')
    expect(kagenti?.displayName).toContain('gemini-kagenti-agent')
  })

  it('does not add kagenti when already in the agents list from the backend', () => {
    const agents: AgentInfo[] = [makeAgent('kagenti', 'kagenti')]
    const result = buildVisibleAgents(agents, [], {
      kagentAvailable: false,
      kagentiAvailable: true,
      selectedKagentAgent: null,
      selectedKagentiAgent: GEMINI_AGENT,
    })
    // Should not duplicate
    expect(result.filter(a => a.provider === 'kagenti')).toHaveLength(1)
  })

  it('marks kagenti as unavailable and includes installMissionId when not available', () => {
    const result = buildVisibleAgents([], [], {
      kagentAvailable: false,
      kagentiAvailable: false,
      selectedKagentAgent: null,
      selectedKagentiAgent: null,
    })
    const kagenti = result.find(a => a.provider === 'kagenti')
    expect(kagenti?.available).toBe(false)
    expect(kagenti?.installMissionId).toBe('install-kagenti')
  })

  it('includes no installMissionId for kagenti when available', () => {
    const result = buildVisibleAgents([], [], {
      kagentAvailable: false,
      kagentiAvailable: true,
      selectedKagentAgent: null,
      selectedKagentiAgent: MOCK_AGENT,
    })
    const kagenti = result.find(a => a.provider === 'kagenti')
    expect(kagenti?.installMissionId).toBeUndefined()
  })

  it('shows plain "Kagenti" displayName when no agent is selected', () => {
    const result = buildVisibleAgents([], [], {
      kagentAvailable: false,
      kagentiAvailable: true,
      selectedKagentAgent: null,
      selectedKagentiAgent: null,
    })
    const kagenti = result.find(a => a.provider === 'kagenti')
    expect(kagenti?.displayName).toBe('Kagenti')
  })

  it('includes both kagent and kagenti when both are available', () => {
    const result = buildVisibleAgents([], [], {
      kagentAvailable: true,
      kagentiAvailable: true,
      selectedKagentAgent: { name: 'my-kagent', namespace: 'ns' },
      selectedKagentiAgent: GEMINI_AGENT,
    })
    expect(result.some(a => a.provider === 'kagenti')).toBe(true)
    expect(result.some(a => a.provider === 'kagent')).toBe(true)
  })

  it('merges CLI agents with kagenti without duplication', () => {
    const cli: AgentInfo[] = [makeAgent('goose', 'block', false)]
    const result = buildVisibleAgents([], cli, {
      kagentAvailable: false,
      kagentiAvailable: true,
      selectedKagentAgent: null,
      selectedKagentiAgent: GEMINI_AGENT,
    })
    expect(result.some(a => a.name === 'goose')).toBe(true)
    expect(result.some(a => a.provider === 'kagenti')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// sectionAgents — kagenti mode
// ---------------------------------------------------------------------------

describe('sectionAgents — kagenti mode', () => {
  it('puts kagenti in the clusterAgents section', () => {
    const agents: AgentInfo[] = [
      makeAgent('claude-code', 'anthropic'),
      makeAgent('kagenti', 'kagenti'),
    ]
    // Pass null as selectedAgent so clusterAgents retains kagenti (not pinned to top)
    const { cliAgents, clusterAgents } = sectionAgents(agents, null, CLUSTER_PROVIDERS)
    expect(clusterAgents.some(a => a.provider === 'kagenti')).toBe(true)
    expect(cliAgents.some(a => a.provider === 'kagenti')).toBe(false)
  })

  it('pins the selected kagenti agent at the top as selectedAgentInfo', () => {
    const agents: AgentInfo[] = [
      makeAgent('claude-code', 'anthropic'),
      makeAgent('kagenti', 'kagenti'),
    ]
    const { selectedAgentInfo } = sectionAgents(agents, 'kagenti', CLUSTER_PROVIDERS)
    expect(selectedAgentInfo?.provider).toBe('kagenti')
  })

  it('sorts kagenti before kagent in clusterAgents section', () => {
    const agents: AgentInfo[] = [
      makeAgent('kagent', 'kagent'),
      makeAgent('kagenti', 'kagenti'),
    ]
    const { clusterAgents } = sectionAgents(agents, null, CLUSTER_PROVIDERS)
    const providers = clusterAgents.map(a => a.provider)
    expect(providers.indexOf('kagenti')).toBeLessThan(providers.indexOf('kagent'))
  })

  it('returns empty cliAgents when only cluster agents are present', () => {
    const agents: AgentInfo[] = [
      makeAgent('kagenti', 'kagenti'),
      makeAgent('kagent', 'kagent'),
    ]
    const { cliAgents } = sectionAgents(agents, null, CLUSTER_PROVIDERS)
    expect(cliAgents).toHaveLength(0)
  })

  it('handles null selectedAgent without error', () => {
    const agents: AgentInfo[] = [makeAgent('kagenti', 'kagenti')]
    const { selectedAgentInfo, clusterAgents } = sectionAgents(agents, null, CLUSTER_PROVIDERS)
    expect(selectedAgentInfo).toBeNull()
    expect(clusterAgents).toHaveLength(1)
  })

  it('sorts available kagenti before unavailable kagenti in cluster section', () => {
    const agents: AgentInfo[] = [
      makeAgent('kagent', 'kagent', false),
      makeAgent('kagenti', 'kagenti', true),
    ]
    const { clusterAgents } = sectionAgents(agents, null, CLUSTER_PROVIDERS)
    expect(clusterAgents[0].available).toBe(true)
  })
})
