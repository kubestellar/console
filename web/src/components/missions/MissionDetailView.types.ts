import type { MissionExport, MissionStep } from '../../lib/missions/types'

export type TabId = 'install' | 'uninstall' | 'upgrade' | 'troubleshooting' | 'security'

/** Primary (kubestellar.io) URL for the Console security model. Linked
 *  from the Security tab fallback / footer. Prefer the rendered docs site
 *  for users; the repo version is the source-grounded reference. */
export const SECURITY_MODEL_DOC_URL = 'https://kubestellar.io/docs/console/main/console/security-model/'
/** AI-specific threat model for LLM-backed automation (prompt injection,
 *  supply chain, agent drift). Only lives in the repo. */
export const SECURITY_AI_DOC_URL = 'https://github.com/kubestellar/console/blob/main/docs/security/SECURITY-AI.md'

export interface TabDef {
  id: TabId
  label: string
  icon: React.ComponentType<{ className?: string }>
  steps: MissionStep[]
  emptyMessage: string
  color: string
}

/** Number of shimmer skeleton rows shown while full mission content loads */
export const LOADING_SKELETON_COUNT = 3

export interface MissionDetailViewProps {
  mission: MissionExport
  rawContent: string | null
  showRaw: boolean
  onToggleRaw: () => void
  onImport: () => Promise<void> | void
  onBack: () => void
  onImprove?: () => void
  matchScore?: number
  /** Override the import button label (e.g. "Run" for saved missions) */
  importLabel?: string
  /** Hide the "Back to listing" button (e.g. when opened from saved missions) */
  hideBackButton?: boolean
  /** Shareable URL for this mission (e.g. http://localhost:8080/missions/install-prometheus) */
  shareUrl?: string
  /** Show shimmer skeleton while full mission content is being fetched */
  loading?: boolean
  /** Error message when fetching full mission content failed */
  error?: string | null
  /** Retry callback for re-fetching failed mission content */
  onRetry?: () => void
}
