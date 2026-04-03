/**
 * Navigation data structure for Console Studio.
 * Flat nav — clean list of sections.
 */
import {
  LayoutGrid,
  LayoutDashboard,
  Layout,
  type LucideIcon,
} from 'lucide-react'

export type CustomizerSection =
  | 'cards'
  | 'dashboards'
  | 'collections'

export interface NavItem {
  id: CustomizerSection
  label: string
  icon: LucideIcon
}

export const CUSTOMIZER_NAV: NavItem[] = [
  { id: 'cards', label: 'Cards', icon: LayoutGrid },
  { id: 'collections', label: 'Card Collections', icon: Layout },
  { id: 'dashboards', label: 'Dashboards', icon: LayoutDashboard },
]

export const DEFAULT_SECTION: CustomizerSection = 'cards'
