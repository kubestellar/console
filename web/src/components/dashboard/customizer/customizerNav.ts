/**
 * Navigation data structure for Console Studio.
 * Flat nav — no group headers since each group has only 1 item.
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

/** Flat navigation items — no group headers needed */
export const CUSTOMIZER_NAV: NavItem[] = [
  { id: 'cards', label: 'Cards', icon: LayoutGrid },
  { id: 'dashboards', label: 'Dashboards', icon: LayoutDashboard },
  { id: 'collections', label: 'Card Collections', icon: Layout },
]

export const DEFAULT_SECTION: CustomizerSection = 'cards'
