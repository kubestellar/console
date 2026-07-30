import { useSyncExternalStore } from 'react'
import {
  getUpgradeState,
  subscribeUpgradeState,
  type UpgradeState,
} from '../lib/upgradeState'

/**
 * React hook to subscribe to the global upgrade state singleton.
 *
 * Uses useSyncExternalStore for tear-free reads that are compatible
 * with concurrent rendering.
 */
export function useUpgradeState(): UpgradeState {
  return useSyncExternalStore(subscribeUpgradeState, getUpgradeState, getUpgradeState)
}
