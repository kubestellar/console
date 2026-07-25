import type { PayloadProject, MissionControlState } from '../types'

export function resolveKbPath(proj: PayloadProject): string | undefined {
  if (proj.kbPath) return proj.kbPath
  // Convention: fixes/cncf-install/install-{name}.json
  const slug = proj.name.toLowerCase().replace(/\s+/g, '-')
  return `fixes/cncf-install/install-${slug}.json`
}

export const OVERLAYS = [
  { key: 'architecture' as const, icon: 'Layout', label: 'Architecture' },
  { key: 'compute' as const, icon: 'Zap', label: 'Compute' },
  { key: 'storage' as const, icon: 'HardDrive', label: 'Storage' },
  { key: 'network' as const, icon: 'Network', label: 'Network' },
  { key: 'security' as const, icon: 'Shield', label: 'Security' },
]

export const ZOOM_MIN = 0.3
export const ZOOM_MAX = 3
export const ZOOM_STEP = 0.2

export const INFO_PANEL_MIN = 280
export const INFO_PANEL_MAX = 600
export const INFO_PANEL_DEFAULT = 416
export const INFO_PANEL_LS_KEY = 'mission-control-info-panel-width'

export const MIN_LABEL_GAP = 14
export const NODE_RADIUS = 18
export const LABEL_OFFSET_Y = 12
