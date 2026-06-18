/**
 * agent.ts
 *
 * Aggregated agent-facing API helpers.
 *
 * These wrappers lazy-load the existing backend helper modules so the split
 * barrel can expose agent APIs without creating a static import cycle back
 * through `../api`.
 */

export type { KagentAgent, KagentStatus } from '../kagentBackend'
export type {
  SSEDecodeState,
  KagentiProviderAgent,
  KagentiLLMProvider,
  KagentiProviderStatus,
  KagentiProviderConfigStatus,
  FetchKagentiProviderAgentsOptions,
  KagentiProviderAgentDiscoveryResult,
} from '../kagentiProviderBackend'

type FetchKagentStatusOptions = Parameters<typeof import('../kagentBackend').fetchKagentStatus>[0]
type FetchKagentAgentsOptions = Parameters<typeof import('../kagentBackend').fetchKagentAgents>[0]
type KagentChatArgs = Parameters<typeof import('../kagentBackend').kagentChat>
type KagentCallToolArgs = Parameters<typeof import('../kagentBackend').kagentCallTool>
type FetchKagentiProviderStatusOptions = Parameters<typeof import('../kagentiProviderBackend').fetchKagentiProviderStatus>[0]
type FetchKagentiProviderAgentsOptions = Parameters<typeof import('../kagentiProviderBackend').fetchKagentiProviderAgents>[0]
type DiscoverKagentiProviderAgentOptions = Parameters<typeof import('../kagentiProviderBackend').discoverKagentiProviderAgent>[0]
type UpdateKagentiProviderConfigPayload = Parameters<typeof import('../kagentiProviderBackend').updateKagentiProviderConfig>[0]
type KagentiProviderChatArgs = Parameters<typeof import('../kagentiProviderBackend').kagentiProviderChat>
type KagentiProviderCallToolArgs = Parameters<typeof import('../kagentiProviderBackend').kagentiProviderCallTool>

export interface SSEDecodeState {
  remainder: string
  pendingDataLines: string[]
}

function normalizeSSEDataLine(line: string): string {
  const raw = line.slice('data:'.length)
  return raw.startsWith(' ') ? raw.slice(1) : raw
}

export function createSSEDecodeState(): SSEDecodeState {
  return {
    remainder: '',
    pendingDataLines: [],
  }
}

export function consumeSSEChunk(chunk: string, state: SSEDecodeState): string[] {
  state.remainder += chunk
  const lines = state.remainder.split('\n')
  state.remainder = lines.pop() || ''
  const events: string[] = []

  for (const rawLine of lines) {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine
    if (line === '') {
      if (state.pendingDataLines.length > 0) {
        events.push(state.pendingDataLines.join('\n'))
        state.pendingDataLines = []
      }
      continue
    }

    if (line.startsWith('data:')) {
      state.pendingDataLines.push(normalizeSSEDataLine(line))
    }
  }

  return events
}

export function flushSSEDecodeState(state: SSEDecodeState): string[] {
  if (state.remainder.startsWith('data:')) {
    state.pendingDataLines.push(normalizeSSEDataLine(state.remainder))
    state.remainder = ''
  }

  if (state.pendingDataLines.length === 0) return []

  const events = [state.pendingDataLines.join('\n')]
  state.pendingDataLines = []
  return events
}

export async function fetchKagentStatus(options: FetchKagentStatusOptions = {}) {
  const module = await import('../kagentBackend')
  return module.fetchKagentStatus(options)
}

export async function fetchKagentAgents(options: FetchKagentAgentsOptions = {}) {
  const module = await import('../kagentBackend')
  return module.fetchKagentAgents(options)
}

export async function kagentChat(...args: KagentChatArgs) {
  const module = await import('../kagentBackend')
  return module.kagentChat(...args)
}

export async function kagentCallTool(...args: KagentCallToolArgs) {
  const module = await import('../kagentBackend')
  return module.kagentCallTool(...args)
}

export async function fetchKagentiProviderStatus(options: FetchKagentiProviderStatusOptions = {}) {
  const module = await import('../kagentiProviderBackend')
  return module.fetchKagentiProviderStatus(options)
}

export async function fetchKagentiProviderAgents(options: FetchKagentiProviderAgentsOptions = {}) {
  const module = await import('../kagentiProviderBackend')
  return module.fetchKagentiProviderAgents(options)
}

export async function discoverKagentiProviderAgent(options: DiscoverKagentiProviderAgentOptions = {}) {
  const module = await import('../kagentiProviderBackend')
  return module.discoverKagentiProviderAgent(options)
}

export async function updateKagentiProviderConfig(payload: UpdateKagentiProviderConfigPayload) {
  const module = await import('../kagentiProviderBackend')
  return module.updateKagentiProviderConfig(payload)
}

export async function kagentiProviderChat(...args: KagentiProviderChatArgs) {
  const module = await import('../kagentiProviderBackend')
  return module.kagentiProviderChat(...args)
}

export async function kagentiProviderCallTool(...args: KagentiProviderCallToolArgs) {
  const module = await import('../kagentiProviderBackend')
  return module.kagentiProviderCallTool(...args)
}
