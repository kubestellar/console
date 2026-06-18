/**
 * agent.ts
 *
 * Aggregated agent-facing API helpers.
 */

export {
  fetchKagentStatus,
  fetchKagentAgents,
  kagentChat,
  kagentCallTool,
} from '../kagentBackend'

export {
  createSSEDecodeState,
  consumeSSEChunk,
  flushSSEDecodeState,
  fetchKagentiProviderStatus,
  fetchKagentiProviderAgents,
  discoverKagentiProviderAgent,
  updateKagentiProviderConfig,
  kagentiProviderChat,
  kagentiProviderCallTool,
} from '../kagentiProviderBackend'
