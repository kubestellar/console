export interface TreeNode {
  id: string
  name: string
  path: string
  type: 'file' | 'directory'
  source: 'community' | 'github' | 'local'
  children?: TreeNode[]
  loaded?: boolean
  loading?: boolean
  description?: string
  /** True once the directory has been loaded and found to contain no missions */
  isEmpty?: boolean
  /** GitHub repo owner (for external sources like Kubara) */
  repoOwner?: string
  /** GitHub repo name (for external sources like Kubara) */
  repoName?: string
}

export type ViewMode = 'grid' | 'list'
export type BrowserTab = 'recommended' | 'installers' | 'fixes'

export const BROWSER_TABS: { id: BrowserTab; label: string; icon: string }[] = [
  { id: 'recommended', label: 'Recommended', icon: '🔍' },
  { id: 'installers', label: 'Installers', icon: '📦' },
  { id: 'fixes', label: 'Fixes', icon: '🔧' },
]
