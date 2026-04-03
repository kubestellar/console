/**
 * Navigation data structure for the unified Console Studio.
 */
import {
  LayoutGrid,
  Sparkles,
  LayoutDashboard,
  Layout,
  type LucideIcon,
} from 'lucide-react'

export type CustomizerSection =
  | 'cards-browse'
  | 'cards-ai'
  | 'dashboards'
  | 'templates'

export interface NavItem {
  id: CustomizerSection
  labelKey: string
  /** Hardcoded fallback if i18n key is missing */
  fallback: string
  icon: LucideIcon
}

export interface NavGroup {
  labelKey: string
  fallback: string
  items: NavItem[]
}

export const CUSTOMIZER_NAV: NavGroup[] = [
  {
    labelKey: 'dashboard.studio.sections.cards',
    fallback: 'Cards',
    items: [
      { id: 'cards-browse', labelKey: 'dashboard.studio.sections.browse', fallback: 'Browse Catalog', icon: LayoutGrid },
      { id: 'cards-ai', labelKey: 'dashboard.studio.sections.aiSuggestions', fallback: 'AI Suggestions', icon: Sparkles },
    ],
  },
  {
    labelKey: 'dashboard.studio.sections.dashboards',
    fallback: 'Dashboards',
    items: [
      { id: 'dashboards', labelKey: 'dashboard.studio.sections.manageDashboards', fallback: 'Manage Dashboards', icon: LayoutDashboard },
    ],
  },
  {
    labelKey: 'dashboard.studio.sections.collections',
    fallback: 'Card Collections',
    items: [
      { id: 'templates', labelKey: 'dashboard.studio.sections.cardCollections', fallback: 'Card Collections', icon: Layout },
    ],
  },
]

export const DEFAULT_SECTION: CustomizerSection = 'cards-browse'
