import { LayoutGrid, Puzzle, Palette } from 'lucide-react'
import type { MarketplaceItemType } from '../../hooks/useMarketplace'

export const ISSUES_URL = 'https://github.com/kubestellar/console-marketplace/issues?q=is%3Aissue%20is%3Aopen%20field.label%3Ahelp%20wanted'

export const TYPE_LABELS: Record<MarketplaceItemType, { label: string; icon: typeof LayoutGrid }> = {
  dashboard: { label: 'Dashboards', icon: LayoutGrid },
  'card-preset': { label: 'Card Presets', icon: Puzzle },
  theme: { label: 'Themes', icon: Palette } }

export const MATURITY_CONFIG = {
  graduated: { label: 'Graduated', color: 'text-green-400 bg-green-950 border-green-800' },
  incubating: { label: 'Incubating', color: 'text-blue-400 bg-blue-950 border-blue-800' } } as const

