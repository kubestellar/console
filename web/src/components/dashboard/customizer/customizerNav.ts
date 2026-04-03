/**
 * Navigation data structure for Console Studio.
 * Flat nav — clean list of sections.
 */
import {
  LayoutGrid,
  LayoutDashboard,
  Layout,
  Wand2,
  Activity,
  type LucideIcon,
} from 'lucide-react'

export type CustomizerSection =
  | 'cards'
  | 'card-factory'
  | 'stat-factory'
  | 'dashboards'
  | 'collections'

export interface NavItem {
  id: CustomizerSection
  label: string
  icon: LucideIcon
}

export const CUSTOMIZER_NAV: NavItem[] = [
  { id: 'cards', label: 'Cards', icon: LayoutGrid },
  { id: 'card-factory', label: 'Create Custom Card', icon: Wand2 },
  { id: 'stat-factory', label: 'Create Stats Card', icon: Activity },
  { id: 'dashboards', label: 'Dashboards', icon: LayoutDashboard },
  { id: 'collections', label: 'Card Collections', icon: Layout },
]

export const DEFAULT_SECTION: CustomizerSection = 'cards'
