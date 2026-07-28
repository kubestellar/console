/**
 * Complementary coverage for agentSelectorUtils.ts.
 *
 * The existing agentSelectorUtils.kagenti.test.ts only covers the
 * kagenti/kagent in-cluster branches of buildVisibleAgents. This file fills
 * the remaining gaps:
 *
 *   - LOCAL_LLM_INSTALL_MISSIONS enrichment (9 local runners)
 *   - bob-hiding when not available
 *   - alwaysShowCli stub merging (dedup by name AND by provider)
 *   - LOCAL_LLM_INSTALL_MISSIONS constant shape (frozen + registered keys)
 *   - sectionAgents (selected pinning, section sort order, kagenti-first
 *     cluster ordering)
 *
 * These functions drive the AgentSelector dropdown — any regression
 * silently mis-orders or hides agents in a UX-visible way.
 */
import { describe, it, expect } from 'vitest'
import {
  buildVisibleAgents,
  sectionAgents,
  CLUSTER_PROVIDER_KEYS,
  LOCAL_LLM_INSTALL_MISSIONS,
} from '../agentSelectorUtils'
import type { AgentInfo, AgentProvider } from '../../../types/agent'

function makeAgent(
  name: string,
  provider: AgentProvider,
  available = true,
  displayName?: string,
): AgentInfo {
  return {
    name,
    displayName: displayName ?? name,
    description: '',
    provider,
    available,
  }
}

const NO_CLUSTER_BACKEND = {
  kagentAvailable: false,
  kagentiAvailable: false,
  selectedKagentAgent: null,
  selectedKagentiAgent: null,
}

const CLUSTER_PROVIDERS = new Set(CLUSTER_PROVIDER_KEYS)

// ── CLUSTER_PROVIDER_KEYS ───────────────────────────────────────

describe('CLUSTER_PROVIDER_KEYS', () => {
  it('lists exactly kagent and kagenti', () => {
    expect(CLUSTER_PROVIDER_KEYS).toEqual(['kagent', 'kagenti'])
  })
})

// ── LOCAL_LLM_INSTALL_MISSIONS ──────────────────────────────────

describe('LOCAL_LLM_INSTALL_MISSIONS', () => {
  it('is frozen (immutable at runtime)', () => {
    expect(Object.isFrozen(LOCAL_LLM_INSTALL_MISSIONS)).toBe(true)
  })

  it('maps every registered local runner to its install-mission id', () => {
    // The docstring in agentSelectorUtils.ts commits to this exact table —
    // if a new runner is added or removed here, sync the source comment.
    expect(LOCAL_LLM_INSTALL_MISSIONS).toEqual({
      ollama: 'install-ollama',
      llamacpp: 'install-llama-cpp',
      localai: 'install-localai',
      vllm: 'install-vllm',
      'lm-studio': 'install-lm-studio',
      rhaiis: 'install-rhaiis',
      ramalama: 'install-ramalama',
      'open-webui': 'install-open-webui',
      'claude-desktop': 'install-claude-desktop',
    })
  })

  it('returns undefined for names that are not registered runners', () => {
    // Typed as Partial<Record<…>> so callers must handle the missing case.
    expect(LOCAL_LLM_INSTALL_MISSIONS['not-a-runner']).toBeUndefined()
  })
})

// ── buildVisibleAgents — bob visibility ─────────────────────────

describe('buildVisibleAgents — bob visibility', () => {
  it('hides bob when it is unavailable', () => {
    const bob = makeAgent('bob', 'openai', false)
    const result = buildVisibleAgents([bob], [], NO_CLUSTER_BACKEND)
    expect(result.some(a => a.name === 'bob')).toBe(false)
  })

  it('shows bob when it is available', () => {
    const bob = makeAgent('bob', 'openai', true)
    const result = buildVisibleAgents([bob], [], NO_CLUSTER_BACKEND)
    expect(result.some(a => a.name === 'bob')).toBe(true)
  })

  it('never hides non-bob agents based on availability', () => {
    const ollama = makeAgent('ollama', 'ollama', false)
    const result = buildVisibleAgents([ollama], [], NO_CLUSTER_BACKEND)
    expect(result.some(a => a.name === 'ollama')).toBe(true)
  })
})

// ── buildVisibleAgents — local LLM install-mission enrichment ───

describe('buildVisibleAgents — local LLM install-mission enrichment', () => {
  it('attaches installMissionId for unavailable local runners', () => {
    const ollama = makeAgent('ollama', 'ollama', false)
    const result = buildVisibleAgents([ollama], [], NO_CLUSTER_BACKEND)
    const found = result.find(a => a.name === 'ollama')
    expect(found?.installMissionId).toBe('install-ollama')
  })

  it('attaches install-vllm for unavailable vllm', () => {
    const vllm = makeAgent('vllm', 'vllm' as AgentProvider, false)
    const result = buildVisibleAgents([vllm], [], NO_CLUSTER_BACKEND)
    expect(result.find(a => a.name === 'vllm')?.installMissionId).toBe('install-vllm')
  })

  it('does not overwrite an existing installMissionId', () => {
    const ollama: AgentInfo = {
      ...makeAgent('ollama', 'ollama', false),
      installMissionId: 'custom-mission',
    }
    const result = buildVisibleAgents([ollama], [], NO_CLUSTER_BACKEND)
    expect(result.find(a => a.name === 'ollama')?.installMissionId).toBe('custom-mission')
  })

  it('does not enrich available runners', () => {
    const ollama = makeAgent('ollama', 'ollama', true)
    const result = buildVisibleAgents([ollama], [], NO_CLUSTER_BACKEND)
    expect(result.find(a => a.name === 'ollama')?.installMissionId).toBeUndefined()
  })

  it('leaves unknown-runner names untouched (no installMissionId injected)', () => {
    const unknown = makeAgent('unknown-runner', 'openai', false)
    const result = buildVisibleAgents([unknown], [], NO_CLUSTER_BACKEND)
    expect(result.find(a => a.name === 'unknown-runner')?.installMissionId).toBeUndefined()
  })
})

// ── buildVisibleAgents — alwaysShowCli stub merging ─────────────

describe('buildVisibleAgents — alwaysShowCli stubs', () => {
  it('appends a stub when neither its name nor provider is present', () => {
    const stub = makeAgent('claude-code', 'anthropic-local', false)
    const result = buildVisibleAgents([], [stub], NO_CLUSTER_BACKEND)
    expect(result.some(a => a.name === 'claude-code')).toBe(true)
  })

  it('does not append a stub if the same name is already present', () => {
    const existing = makeAgent('claude-code', 'anthropic-local', true)
    const stub = makeAgent('claude-code', 'anthropic-local', false)
    const result = buildVisibleAgents([existing], [stub], NO_CLUSTER_BACKEND)
    expect(result.filter(a => a.name === 'claude-code')).toHaveLength(1)
    // Existing (available=true) preserved, stub discarded
    expect(result.find(a => a.name === 'claude-code')?.available).toBe(true)
  })

  it('does not append a stub if the same provider is already present under a different name', () => {
    const existing = makeAgent('other-anthropic-agent', 'anthropic-local', true)
    const stub = makeAgent('claude-code', 'anthropic-local', false)
    const result = buildVisibleAgents([existing], [stub], NO_CLUSTER_BACKEND)
    expect(result.some(a => a.name === 'claude-code')).toBe(false)
  })

  it('appends multiple stubs when none are present', () => {
    const stubs = [
      makeAgent('claude-code', 'anthropic-local', false),
      makeAgent('codex', 'openai-cli', false),
    ]
    const result = buildVisibleAgents([], stubs, NO_CLUSTER_BACKEND)
    expect(result.some(a => a.name === 'claude-code')).toBe(true)
    expect(result.some(a => a.name === 'codex')).toBe(true)
  })
})

// ── buildVisibleAgents — ordering ───────────────────────────────

describe('buildVisibleAgents — output ordering', () => {
  it('places merged backend agents before the in-cluster kagenti/kagent block', () => {
    const backendAgent = makeAgent('ollama', 'ollama', true)
    const result = buildVisibleAgents([backendAgent], [], {
      kagentAvailable: true,
      kagentiAvailable: true,
      selectedKagentAgent: null,
      selectedKagentiAgent: null,
    })
    const backendIdx = result.findIndex(a => a.name === 'ollama')
    const kagentiIdx = result.findIndex(a => a.provider === 'kagenti')
    const kagentIdx = result.findIndex(a => a.provider === 'kagent')
    expect(backendIdx).toBeGreaterThanOrEqual(0)
    expect(backendIdx).toBeLessThan(kagentiIdx)
    expect(backendIdx).toBeLessThan(kagentIdx)
  })

  it('emits kagenti before kagent in the in-cluster block', () => {
    const result = buildVisibleAgents([], [], {
      kagentAvailable: true,
      kagentiAvailable: true,
      selectedKagentAgent: null,
      selectedKagentiAgent: null,
    })
    const kagentiIdx = result.findIndex(a => a.provider === 'kagenti')
    const kagentIdx = result.findIndex(a => a.provider === 'kagent')
    expect(kagentiIdx).toBeGreaterThanOrEqual(0)
    expect(kagentIdx).toBeGreaterThanOrEqual(0)
    expect(kagentiIdx).toBeLessThan(kagentIdx)
  })
})

// ── sectionAgents ───────────────────────────────────────────────

describe('sectionAgents', () => {
  it('extracts the selected agent into selectedAgentInfo and removes it from lists', () => {
    const agents = [
      makeAgent('ollama', 'ollama'),
      makeAgent('claude-code', 'anthropic-local'),
    ]
    const result = sectionAgents(agents, 'ollama', CLUSTER_PROVIDERS)
    expect(result.selectedAgentInfo?.name).toBe('ollama')
    expect(result.cliAgents.map(a => a.name)).not.toContain('ollama')
    expect(result.clusterAgents.map(a => a.name)).not.toContain('ollama')
  })

  it('returns null for selectedAgentInfo when the selection is not in the list', () => {
    const agents = [makeAgent('ollama', 'ollama')]
    const result = sectionAgents(agents, 'not-present', CLUSTER_PROVIDERS)
    expect(result.selectedAgentInfo).toBeNull()
    expect(result.cliAgents.map(a => a.name)).toContain('ollama')
  })

  it('returns null for selectedAgentInfo when selectedAgent is null', () => {
    const agents = [makeAgent('ollama', 'ollama')]
    const result = sectionAgents(agents, null, CLUSTER_PROVIDERS)
    expect(result.selectedAgentInfo).toBeNull()
  })

  it('routes cluster providers (kagent/kagenti) into clusterAgents', () => {
    const agents = [
      makeAgent('kagent', 'kagent'),
      makeAgent('kagenti', 'kagenti'),
      makeAgent('ollama', 'ollama'),
    ]
    const result = sectionAgents(agents, null, CLUSTER_PROVIDERS)
    expect(result.clusterAgents.map(a => a.provider).sort()).toEqual(['kagent', 'kagenti'])
    expect(result.cliAgents.map(a => a.name)).toEqual(['ollama'])
  })

  it('sorts CLI agents with available first, then alphabetically by displayName', () => {
    const agents = [
      makeAgent('z-avail', 'openai', true, 'Z Available'),
      makeAgent('a-unavail', 'openai', false, 'A Unavailable'),
      makeAgent('m-avail', 'openai', true, 'M Available'),
    ]
    const result = sectionAgents(agents, null, CLUSTER_PROVIDERS)
    expect(result.cliAgents.map(a => a.name)).toEqual(['m-avail', 'z-avail', 'a-unavail'])
  })

  it('sorts cluster agents with available first, then kagenti before kagent, then displayName', () => {
    const agents = [
      makeAgent('kagent', 'kagent', true, 'Kagent'),
      makeAgent('kagenti', 'kagenti', true, 'Kagenti'),
    ]
    const result = sectionAgents(agents, null, CLUSTER_PROVIDERS)
    expect(result.clusterAgents.map(a => a.provider)).toEqual(['kagenti', 'kagent'])
  })

  it('within cluster agents, unavailable sorts after available regardless of provider preference', () => {
    const agents = [
      makeAgent('kagenti', 'kagenti', false, 'Kagenti'),
      makeAgent('kagent', 'kagent', true, 'Kagent'),
    ]
    const result = sectionAgents(agents, null, CLUSTER_PROVIDERS)
    expect(result.clusterAgents.map(a => a.provider)).toEqual(['kagent', 'kagenti'])
  })

  it('returns empty arrays for empty input', () => {
    const result = sectionAgents([], null, CLUSTER_PROVIDERS)
    expect(result.selectedAgentInfo).toBeNull()
    expect(result.cliAgents).toEqual([])
    expect(result.clusterAgents).toEqual([])
  })
})
