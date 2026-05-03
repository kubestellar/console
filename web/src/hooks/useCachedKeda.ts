/**
 * useCachedKeda — Top-level re-export of the KEDA cached-status hook.
 *
 * The canonical implementation lives alongside the card at
 * `components/cards/keda_status/useKedaStatus.ts`. This file re-exports it
 * under the conventional `useCachedKeda` name so the unified card registry
 * and external consumers (marketplace, docs, tests) can import from
 * `hooks/useCachedKeda` — mirroring the pattern used by `useCachedLinkerd`,
 * `useCachedTikv`, `useCachedContainerd`, and `useCachedCiliumStatus`.
 */

export { useKedaStatus as useCachedKeda } from '../components/cards/keda_status/useKedaStatus'
export type {
  KedaStatus,
  UseKedaStatusResult as UseCachedKedaResult,
} from '../components/cards/keda_status/useKedaStatus'
