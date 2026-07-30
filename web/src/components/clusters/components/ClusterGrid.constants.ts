import type { CSSProperties } from 'react'
import type { ClusterLayoutMode } from './ClusterGrid.types'

export const CLUSTER_GRID_DIV_STYLE_1: CSSProperties = {
  opacity: 0.25,
  maskImage: 'linear-gradient(45deg, rgba(0,0,0,1) 0%, rgba(0,0,0,0.4) 80%)',
  WebkitMaskImage: 'linear-gradient(45deg, rgba(0,0,0,1) 0%, rgba(0,0,0,0.4) 80%)',
}

export const CLUSTER_GRID_DIV_STYLE_2: CSSProperties = {
  opacity: 0.15,
  maskImage: 'linear-gradient(to left, rgba(0,0,0,0) 0%, rgba(0,0,0,1) 40%)',
  WebkitMaskImage: 'linear-gradient(to left, rgba(0,0,0,0) 0%, rgba(0,0,0,1) 40%)',
}

export const MIN_SPIN_DURATION_MS = 1_000
export const COPY_FEEDBACK_MS = 1_500
export const THEME_COLOR = 'var(--ks-purple)'
export const DISABLED_CLUSTER_ACTION_CLASS = 'bg-secondary/30 text-muted-foreground/50 cursor-not-allowed opacity-60'
export const LOCAL_PLATFORMS = new Set(['kind', 'minikube', 'k3s'])

export const CLUSTER_GRID_CLASSES: Record<ClusterLayoutMode, string> = {
  grid: 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4',
  list: 'flex flex-col gap-3',
  compact: 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3',
  wide: 'grid grid-cols-1 lg:grid-cols-2 gap-4',
}
