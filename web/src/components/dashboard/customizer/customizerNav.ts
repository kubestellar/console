/**
 * Navigation data structure for the unified DashboardCustomizer.
 *
 * Follows the Notion/Linear settings pattern: grouped sections with
 * a persistent left sidebar.
 */
import {
  LayoutGrid,
  Sparkles,
  PanelLeft,
  FolderPlus,
  Layout,
  Download,
  type LucideIcon,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Section IDs — used for routing within the customizer
// ---------------------------------------------------------------------------

export type CustomizerSection =
  | 'cards-browse'
  | 'cards-ai'
  | 'nav-sidebar'
  | 'nav-add'
  | 'templates'
  | 'settings'

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
    labelKey: 'dashboard.studio.sections.navigation',
    items: [
      { id: 'nav-sidebar', labelKey: 'dashboard.studio.sections.sidebar', icon: PanelLeft },
      { id: 'nav-add', labelKey: 'dashboard.studio.sections.addPages', icon: FolderPlus },
    ],
  },
  {
    labelKey: 'dashboard.studio.sections.templates',
    items: [
      { id: 'templates', labelKey: 'dashboard.studio.sections.gallery', icon: Layout },
    ],
  },
]

/** Utility actions shown below the divider in the sidebar */
export const CUSTOMIZER_ACTIONS: NavItem[] = [
  { id: 'settings', labelKey: 'dashboard.studio.sections.settings', icon: Download },
]

/** Default section when opening the customizer */
export const DEFAULT_SECTION: CustomizerSection = 'cards-browse'

/** Map URL param values to sections for deep-linking */
export const URL_SECTION_MAP: Record<string, CustomizerSection> = {
  'addCard': 'cards-browse',
  'customizeSidebar': 'nav-sidebar',
  'templates': 'templates',
}
