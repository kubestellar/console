/**
 * Navigation data structure for the unified DashboardCustomizer.
 *
 * Follows the Notion/Linear settings pattern: grouped sections with
 * a persistent left sidebar.
 */
import {
  LayoutGrid,
  Sparkles,
  LayoutDashboard,
  Layout,
  type LucideIcon,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Section IDs — used for routing within the customizer
// ---------------------------------------------------------------------------

export type CustomizerSection =
  | 'cards-browse'
  | 'cards-ai'
  | 'dashboards'
  | 'templates'

// ---------------------------------------------------------------------------
// Navigation groups
// ---------------------------------------------------------------------------

export interface NavItem {
  id: CustomizerSection
  labelKey: string
  icon: LucideIcon
}

export interface NavGroup {
  labelKey: string
  items: NavItem[]
}

export const CUSTOMIZER_NAV: NavGroup[] = [
  {
    labelKey: 'dashboard.studio.sections.cards',
    items: [
      { id: 'cards-browse', labelKey: 'dashboard.studio.sections.browse', icon: LayoutGrid },
      { id: 'cards-ai', labelKey: 'dashboard.studio.sections.aiSuggestions', icon: Sparkles },
    ],
  },
  {
    labelKey: 'dashboard.studio.sections.dashboards',
    items: [
      { id: 'dashboards', labelKey: 'dashboard.studio.sections.manageDashboards', icon: LayoutDashboard },
    ],
  },
  {
    labelKey: 'dashboard.studio.sections.templates',
    items: [
      { id: 'templates', labelKey: 'dashboard.studio.sections.gallery', icon: Layout },
    ],
  },
]

/** Default section when opening the customizer */
export const DEFAULT_SECTION: CustomizerSection = 'cards-browse'
