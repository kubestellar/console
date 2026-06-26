import { describe, it, expect } from 'vitest'
import { AgentSelector } from './AgentSelector'
import { buildVisibleAgents, sectionAgents, CLUSTER_PROVIDER_KEYS } from './agentSelectorUtils'
import type { KagentBackendInfo } from './agentSelectorUtils'
import type { AgentInfo } from '../../types/agent'

// Helpers
const makeAgent = (overrides: Partial<AgentInfo> & { name: string }): AgentInfo => ({
  displayName: overrides.name,
  description: '',
  provider: 'anthropic',
  available: true,
  ...overrides,
})

const noBackend: KagentBackendInfo = {
  kagentAvailable: false,
  kagentiAvailable: false,
  selectedKagentAgent: null,
  selectedKagentiAgent: null,
}

const ALWAYS_SHOW_CLI: AgentInfo[] = [
  makeAgent({ name: 'goose', provider: 'block', available: false, installUrl: 'https://github.com/block/goose' }),
  makeAgent({ name: 'copilot-cli', provider: 'github-cli', available: false, installUrl: 'https://docs.github.com/en/copilot/github-copilot-in-the-cli' }),
]

const clusterProviders = new Set(CLUSTER_PROVIDER_KEYS)

describe('AgentSelector Component', () => {
  it('exports AgentSelector component', () => {
    expect(AgentSelector).toBeDefined()
    expect(typeof AgentSelector).toBe('function')
  })
})

describe('buildVisibleAgents', () => {
  it('hides bob when not available', () => {
    const agents = [
      makeAgent({ name: 'claude', available: true }),
      makeAgent({ name: 'bob', provider: 'bob', available: false }),
    ]
    const result = buildVisibleAgents(agents, ALWAYS_SHOW_CLI, noBackend)
    expect(result.find(a => a.name === 'bob')).toBeUndefined()
  })

  it('shows bob when available', () => {
    const agents = [
      makeAgent({ name: 'claude', available: true }),
      makeAgent({ name: 'bob', provider: 'bob', available: true }),
    ]
    const result = buildVisibleAgents(agents, ALWAYS_SHOW_CLI, noBackend)
    expect(result.find(a => a.name === 'bob')).toBeDefined()
  })

  it('injects always-show CLI stubs when not in backend list', () => {
    const agents = [makeAgent({ name: 'claude', available: true })]
    const result = buildVisibleAgents(agents, ALWAYS_SHOW_CLI, noBackend)
    expect(result.find(a => a.name === 'goose')).toBeDefined()
    expect(result.find(a => a.name === 'copilot-cli')).toBeDefined()
  })

  it('does not duplicate an always-show stub when backend already reports it', () => {
    const agents = [
      makeAgent({ name: 'claude', available: true }),
      makeAgent({ name: 'goose', provider: 'block', available: true }),
    ]
    const result = buildVisibleAgents(agents, ALWAYS_SHOW_CLI, noBackend)
    const gooseEntries = result.filter(a => a.name === 'goose')
    expect(gooseEntries).toHaveLength(1)
    // The live (available) backend entry should win, not the stub
    expect(gooseEntries[0].available).toBe(true)
  })

  it('does not duplicate when backend returns same provider key', () => {
    const agents = [
      makeAgent({ name: 'goose-cli', provider: 'block', available: true }),
    ]
    const result = buildVisibleAgents(agents, ALWAYS_SHOW_CLI, noBackend)
    const blockEntries = result.filter(a => a.provider === 'block')
    expect(blockEntries).toHaveLength(1)
  })

  it('always includes kagent and kagenti entries', () => {
    const result = buildVisibleAgents([], ALWAYS_SHOW_CLI, noBackend)
    expect(result.find(a => a.name === 'kagent')).toBeDefined()
    expect(result.find(a => a.name === 'kagenti')).toBeDefined()
  })

  it('marks kagent/kagenti available when backend signals so', () => {
    const result = buildVisibleAgents([], ALWAYS_SHOW_CLI, {
      kagentAvailable: true,
      kagentiAvailable: true,
      selectedKagentAgent: null,
      selectedKagentiAgent: null,
    })
    expect(result.find(a => a.name === 'kagent')?.available).toBe(true)
    expect(result.find(a => a.name === 'kagenti')?.available).toBe(true)
  })

  it('uses selected agent name in kagent/kagenti display name', () => {
    const result = buildVisibleAgents([], ALWAYS_SHOW_CLI, {
      kagentAvailable: true,
      kagentiAvailable: false,
      selectedKagentAgent: { name: 'my-agent' },
      selectedKagentiAgent: null,
    })
    expect(result.find(a => a.name === 'kagent')?.displayName).toBe('Kagent (my-agent)')
    expect(result.find(a => a.name === 'kagenti')?.displayName).toBe('Kagenti')
  })
})

describe('sectionAgents', () => {
  it('pins the selected agent to selectedAgentInfo', () => {
    const agents = [
      makeAgent({ name: 'claude', provider: 'anthropic', available: true }),
      makeAgent({ name: 'goose', provider: 'block', available: false }),
    ]
    const { selectedAgentInfo } = sectionAgents(agents, 'claude', clusterProviders)
    expect(selectedAgentInfo?.name).toBe('claude')
  })

  it('selectedAgentInfo is null when no agent is selected', () => {
    const agents = [makeAgent({ name: 'claude', provider: 'anthropic', available: true })]
    const { selectedAgentInfo } = sectionAgents(agents, null, clusterProviders)
    expect(selectedAgentInfo).toBeNull()
  })

  it('places non-cluster agents into cliAgents section', () => {
    const agents = [
      makeAgent({ name: 'claude', provider: 'anthropic', available: true }),
      makeAgent({ name: 'goose', provider: 'block', available: false }),
    ]
    const { cliAgents, clusterAgents } = sectionAgents(agents, null, clusterProviders)
    expect(cliAgents.map(a => a.name)).toContain('claude')
    expect(cliAgents.map(a => a.name)).toContain('goose')
    expect(clusterAgents).toHaveLength(0)
  })

  it('places kagent/kagenti into clusterAgents section', () => {
    const agents = [
      makeAgent({ name: 'claude', provider: 'anthropic', available: true }),
      makeAgent({ name: 'kagent', provider: 'kagent', available: false }),
      makeAgent({ name: 'kagenti', provider: 'kagenti', available: true }),
    ]
    const { cliAgents, clusterAgents } = sectionAgents(agents, null, clusterProviders)
    expect(cliAgents.map(a => a.name)).not.toContain('kagent')
    expect(cliAgents.map(a => a.name)).not.toContain('kagenti')
    expect(clusterAgents.map(a => a.name)).toContain('kagent')
    expect(clusterAgents.map(a => a.name)).toContain('kagenti')
  })

  it('sorts available CLI agents before unavailable ones', () => {
    const agents = [
      makeAgent({ name: 'goose', provider: 'block', available: false }),
      makeAgent({ name: 'claude', provider: 'anthropic', available: true }),
    ]
    const { cliAgents } = sectionAgents(agents, null, clusterProviders)
    expect(cliAgents[0].available).toBe(true)
    expect(cliAgents[1].available).toBe(false)
  })

  it('sorts alphabetically within the same availability tier in CLI section', () => {
    const agents = [
      makeAgent({ name: 'Zebra', provider: 'anysphere', available: true, displayName: 'Zebra' }),
      makeAgent({ name: 'Alpha', provider: 'openai', available: true, displayName: 'Alpha' }),
    ]
    const { cliAgents } = sectionAgents(agents, null, clusterProviders)
    expect(cliAgents[0].name).toBe('Alpha')
    expect(cliAgents[1].name).toBe('Zebra')
  })

  it('sorts kagenti before kagent in cluster section regardless of name', () => {
    const agents = [
      makeAgent({ name: 'kagent', provider: 'kagent', available: false }),
      makeAgent({ name: 'kagenti', provider: 'kagenti', available: false }),
    ]
    const { clusterAgents } = sectionAgents(agents, null, clusterProviders)
    expect(clusterAgents[0].provider).toBe('kagenti')
    expect(clusterAgents[1].provider).toBe('kagent')
  })

  it('excludes the selected agent from cliAgents and clusterAgents', () => {
    const agents = [
      makeAgent({ name: 'claude', provider: 'anthropic', available: true }),
      makeAgent({ name: 'goose', provider: 'block', available: true }),
    ]
    const { cliAgents, selectedAgentInfo } = sectionAgents(agents, 'claude', clusterProviders)
    expect(selectedAgentInfo?.name).toBe('claude')
    expect(cliAgents.map(a => a.name)).not.toContain('claude')
  })
})

