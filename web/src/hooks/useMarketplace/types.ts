export interface DashboardSummary {
  id: string
  is_default?: boolean
}

export type MarketplaceItemType = 'dashboard' | 'card-preset' | 'theme'
export type MarketplaceItemStatus = 'available' | 'help-wanted'
export type MarketplaceDifficulty = 'beginner' | 'intermediate' | 'advanced'

export interface CNCFProjectInfo {
  maturity: 'graduated' | 'incubating'
  category: string
  website?: string
}

export interface MarketplaceItem {
  id: string
  name: string
  description: string
  author: string
  authorGithub?: string
  version: string
  screenshot?: string
  downloadUrl: string
  sha256: string
  tags: string[]
  cardCount: number
  type: MarketplaceItemType
  themeColors?: string[]
  status?: MarketplaceItemStatus
  issueUrl?: string
  difficulty?: MarketplaceDifficulty
  skills?: string[]
  cncfProject?: CNCFProjectInfo
}

export interface CNCFStats {
  total: number
  completed: number
  helpWanted: number
  graduatedTotal: number
  incubatingTotal: number
}

export interface MarketplaceRegistry {
  version: string
  updatedAt: string
  items: MarketplaceItem[]
  presets?: MarketplaceItem[]
}

export interface InstalledEntry {
  dashboardId?: string
  installedAt: string
  type: MarketplaceItemType
}

export type InstalledMap = Record<string, InstalledEntry>

export interface InstallResult {
  type: MarketplaceItemType
  data?: unknown
}
