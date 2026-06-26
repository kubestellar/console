import { AlertTriangle, Box, HardDrive, Layers, Network, Server, type LucideIcon } from 'lucide-react'
import type { TreeLens } from './types'

export const MAX_CACHED_PER_TYPE = 500

export interface TreeLensOption {
  id: TreeLens
  icon: LucideIcon
  translationKey: string
  showCount?: boolean
}

export const TREE_LENS_OPTIONS: TreeLensOption[] = [
  { id: 'all', icon: Layers, translationKey: 'resourceTree.lensAll' },
  { id: 'issues', icon: AlertTriangle, translationKey: 'resourceTree.lensIssues', showCount: true },
  { id: 'nodes', icon: Server, translationKey: 'resourceTree.lensNodes' },
  { id: 'workloads', icon: Box, translationKey: 'resourceTree.lensWorkloads' },
  { id: 'storage', icon: HardDrive, translationKey: 'resourceTree.lensStorage' },
  { id: 'network', icon: Network, translationKey: 'resourceTree.lensNetwork' },
]
