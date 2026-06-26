import { useModalState, type UseModalStateResult } from '../lib/modals/useModalNavigation'

export type UseModalResult = UseModalStateResult

/**
 * Compatibility wrapper for callers that still import `useModal` from hooks.
 * The shared implementation lives in `lib/modals/useModalNavigation.ts` so
 * modal state behavior is centralized in one place.
 */
export function useModal(initialOpen = false): UseModalResult {
  return useModalState(initialOpen)
}
