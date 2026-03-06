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
}

export type ViewMode = 'grid' | 'list'
export type BrowserTab = 'recommended' | 'installers' | 'solutions'

export const BROWSER_TABS: { id: BrowserTab; label: string; icon: string }[] = [
  { id: 'recommended', label: 'Recommended', icon: '🔍' },
  { id: 'installers', label: 'Installers', icon: '📦' },
  { id: 'solutions', label: 'Solutions', icon: '🛠️' },
]
