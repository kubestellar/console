import type { MissionExport, MissionStep } from '../../lib/missions/types'

/** Timeout for fetching mission content from the API (ms) */
export const FETCH_TIMEOUT_MS = 10_000

/** Maximum number of steps to preview before truncating */
export const MAX_PREVIEW_STEPS = 5

/** Badge colors by mission type */
export const TYPE_COLORS: Record<string, string> = {
  repair: 'bg-red-500/20 text-red-400 border-red-500/30',
  troubleshoot: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  deploy: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  upgrade: 'bg-green-500/20 text-green-400 border-green-500/30',
  analyze: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  custom: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
}

/** Default badge style for unknown types */
export const DEFAULT_TYPE_COLOR = 'bg-slate-500/20 text-slate-400 border-slate-500/30'

/** Tab definitions for mission content sections */
export type TabId = 'install' | 'uninstall' | 'upgrade' | 'troubleshoot'

export interface TabDef {
  id: TabId
  label: string
  icon: string
  getSteps: (m: MissionExport) => MissionStep[]
  emptyMessage: string
}

export const TABS: TabDef[] = [
  {
    id: 'install',
    label: 'Install',
    icon: '📦',
    getSteps: (m) => m.steps || [],
    emptyMessage: 'Install steps not available.',
  },
  {
    id: 'uninstall',
    label: 'Uninstall',
    icon: '🗑️',
    getSteps: (m) => m.uninstall || [],
    emptyMessage: 'Uninstall steps not yet available for this mission.',
  },
  {
    id: 'upgrade',
    label: 'Update / Upgrade',
    icon: '⬆️',
    getSteps: (m) => m.upgrade || [],
    emptyMessage: 'Upgrade steps not yet available for this mission.',
  },
  {
    id: 'troubleshoot',
    label: 'Troubleshooting',
    icon: '🔧',
    getSteps: (m) => m.troubleshooting || [],
    emptyMessage: 'Troubleshooting steps not yet available for this mission.',
  },
]
