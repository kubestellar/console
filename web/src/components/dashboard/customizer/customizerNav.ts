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

function wrapIcon(icon: LucideIcon): LucideIcon {
  return ((props) => {
    const IconComponent = icon
    return <IconComponent {...props} />
  }) as LucideIcon
}

export const CUSTOMIZER_NAV: NavItem[] = [
  { id: 'cards', label: 'Add Cards', icon: wrapIcon(LayoutGrid) },
  { id: 'collections', label: 'Add Card Collections', icon: wrapIcon(Layout) },
  { id: 'dashboards', label: 'Manage Dashboards', icon: wrapIcon(LayoutDashboard) },
  { id: 'widgets', label: 'Export Widgets', icon: wrapIcon(Download) },
  { id: 'create-dashboard', label: 'Create Custom Dashboard', icon: wrapIcon(FolderPlus), dividerBefore: true },
  { id: 'card-factory', label: 'Create Custom Card', icon: wrapIcon(Wand2) },
  { id: 'stat-factory', label: 'Create Stat Blocks', icon: wrapIcon(Activity) },
]

export const DEFAULT_SECTION: CustomizerSection = 'cards'
