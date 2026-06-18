import { LayoutGrid, Palette, Puzzle, type LucideIcon } from 'lucide-react'
import type { CSSProperties } from 'react'
import type {
  MarketplaceDifficulty,
  MarketplaceItemType,
} from '../../hooks/useMarketplace'

export const MARKETPLACE_GRID_STYLE: CSSProperties = {
  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
}

export type ViewMode = 'grid' | 'list'
export type SortField = 'name' | 'author' | 'type' | 'difficulty'
export type SortOrder = 'asc' | 'desc'

export const VIEW_MODE_KEY = 'kc-marketplace-view-mode'
export const CONTRIBUTE_URL = 'https://github.com/kubestellar/console-marketplace'
export const ISSUES_URL = 'https://github.com/kubestellar/console-marketplace/issues?q=is%3Aissue%20is%3Aopen%20field.label%3Ahelp%20wanted'
export const BANNER_COLLAPSED_KEY = 'kc-cncf-banner-collapsed'
export const MAX_SKILLS = 3
export const MAX_TAGS = 3
export const MAX_THEME_COLORS = 5

export const TYPE_LABELS: Record<MarketplaceItemType, { label: string; icon: LucideIcon }> = {
  dashboard: { label: 'Dashboards', icon: LayoutGrid },
  'card-preset': { label: 'Card Presets', icon: Puzzle },
  theme: { label: 'Themes', icon: Palette },
}

export const DIFFICULTY_CONFIG: Record<MarketplaceDifficulty, { label: string; color: string; stars: number }> = {
  beginner: { label: 'Beginner', color: 'text-green-400 bg-green-950', stars: 1 },
  intermediate: { label: 'Intermediate', color: 'text-yellow-600 dark:text-yellow-400 bg-yellow-500/10', stars: 2 },
  advanced: { label: 'Advanced', color: 'text-red-400 bg-red-950', stars: 3 },
}

export const MATURITY_CONFIG = {
  graduated: { label: 'Graduated', color: 'text-green-400 bg-green-950 border-green-800' },
  incubating: { label: 'Incubating', color: 'text-blue-400 bg-blue-950 border-blue-800' },
} as const
