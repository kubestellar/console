import type { ReactNode } from 'react'
import { Zap, Network, Shield, Layout, HardDrive } from 'lucide-react'
import type { OverlayMode } from './types'

// ---------------------------------------------------------------------------
// Overlay buttons
// ---------------------------------------------------------------------------

export const OVERLAYS: { key: OverlayMode; icon: ReactNode; label: string }[] = [
  { key: 'architecture', icon: <Layout className="w-3.5 h-3.5" />, label: 'Architecture' },
  { key: 'compute', icon: <Zap className="w-3.5 h-3.5" />, label: 'Compute' },
  { key: 'storage', icon: <HardDrive className="w-3.5 h-3.5" />, label: 'Storage' },
  { key: 'network', icon: <Network className="w-3.5 h-3.5" />, label: 'Network' },
  { key: 'security', icon: <Shield className="w-3.5 h-3.5" />, label: 'Security' },
]

// ---------------------------------------------------------------------------
// Panel resize constants
// ---------------------------------------------------------------------------

/** Minimum info-panel width (px) */
export const INFO_PANEL_MIN = 280
/** Maximum info-panel width (px) */
export const INFO_PANEL_MAX = 600
/** Default info-panel width (px) — 26rem */
export const INFO_PANEL_DEFAULT = 416
/** localStorage key for persisted panel width */
export const INFO_PANEL_LS_KEY = 'mission-control-info-panel-width'

// ---------------------------------------------------------------------------
// Zoom constants
// ---------------------------------------------------------------------------

export const ZOOM_MIN = 0.3
export const ZOOM_MAX = 3
export const ZOOM_STEP = 0.2

// ---------------------------------------------------------------------------
// Dependency-label layout constants
// ---------------------------------------------------------------------------

/** Minimum gap (SVG units) between two label slots to avoid overlap */
export const MIN_LABEL_GAP = 14
/** Radius (SVG units) of a project node — used to push labels clear of nodes */
export const NODE_RADIUS = 18
/** Vertical offset (SVG units) to place the label above the edge midpoint */
export const LABEL_OFFSET_Y = 12
