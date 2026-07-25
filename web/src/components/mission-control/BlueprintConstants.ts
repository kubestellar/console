import { Layout, Zap, HardDrive, Network, Shield } from 'lucide-react'
import type { OverlayMode } from './types'

export const OVERLAYS: {key: OverlayMode; icon: React.ReactNode; label: string}[] = [
  {key: 'architecture', icon: <Layout className="w-3.5 h-3.5" />, label: 'Architecture'},
  {key: 'compute', icon: <Zap className="w-3.5 h-3.5" />, label: 'Compute'},
  {key: 'storage', icon: <HardDrive className="w-3.5 h-3.5" />, label: 'Storage'},
  {key: 'network', icon: <Network className="w-3.5 h-3.5" />, label: 'Network'},
  {key: 'security', icon: <Shield className="w-3.5 h-3.5" />, label: 'Security'},
]

export const INFO_PANEL_MIN = 280
export const INFO_PANEL_MAX = 600
export const INFO_PANEL_DEFAULT = 416
export const INFO_PANEL_LS_KEY = 'mission-control-info-panel-width'
export const ZOOM_MIN = 0.3
export const ZOOM_MAX = 3
export const ZOOM_STEP = 0.2
export const MIN_LABEL_GAP = 14
export const NODE_RADIUS = 18
export const LABEL_OFFSET_Y = 12

export function resolveKbPath(type: string): string {
  const paths: Record<string, string> = {'kyverno': '/docs/security/kyverno', 'kubewarden': '/docs/security/kubewarden', 'network-policy': '/docs/networking/network-policies', 'ingress': '/docs/networking/ingress'}
  return paths[type] || '/docs'
}
