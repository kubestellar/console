/**
 * Navigation data structure for Console Studio.
 */
import {
  LayoutGrid,
  LayoutDashboard,
  Layout,
  Wand2,
  Activity,
  FolderPlus,
  Download,
  type LucideIcon,
} from 'lucide-react'

export type CustomizerSection =
  | 'cards'
  | 'collections'
  | 'dashboards'
  | 'widgets'
  | 'create-dashboard'
  | 'card-factory'
  | 'stat-factory'

export interface NavItem {
  id: CustomizerSection
  label: string
  icon: LucideIcon
  /** Show a subtle divider line above this item */
  dividerBefore?: boolean
}

export const CUSTOMIZER_NAV: NavItem[] = [
  { id: 'cards', label: 'Add Cards', icon: LayoutGrid },
  { id: 'collections', label: 'Add Card Collections', icon: Layout },
  { id: 'dashboards', label: 'Manage Dashboards', icon: LayoutDashboard },
  { id: 'widgets', label: 'Export Widgets', icon: Download },
  { id: 'create-dashboard', label: 'Create Custom Dashboard', icon: FolderPlus, dividerBefore: true },
  { id: 'card-factory', label: 'Create Custom Card', icon: Wand2 },
  { id: 'stat-factory', label: 'Create Stat Blocks', icon: Activity },
]

export const DEFAULT_SECTION: CustomizerSection = 'cards'
