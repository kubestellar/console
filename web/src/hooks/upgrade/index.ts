/**
 * Upgrade & self-update hooks
 *
 * Grouped from the flat hooks/ root to improve discoverability.
 * Re-exports all public symbols so existing import paths can migrate
 * to `@/hooks/upgrade` (or use the compatibility re-exports at the old paths).
 */

export { useUpgradeState } from './useUpgradeState'
export { useUpgradeStateMachine } from './useUpgradeStateMachine'
export {
  WS_CONNECTION_TIMEOUT_MS,
  VERSION_REQUEST_TIMEOUT_MS,
  VERSION_CACHE_TTL,
  getCachedVersion,
  getStaleCachedVersion,
  setCachedVersion,
  clearCachedVersions,
  createVersionWsHandle,
  type VersionWsHandle,
  type VersionWsMessage,
} from './useUpgradeWebSocket'
export { useUpdateProgress } from './useUpdateProgress'
export { useSelfUpgrade } from './useSelfUpgrade'
