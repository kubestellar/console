/* eslint-disable react-refresh/only-export-components */
/** Shared props/helpers for the cluster resource detail modals (CPU, Memory, Storage, GPU). */

export interface ResourceModalProps {
  clusterName: string
  onClose: () => void
}

// Skeleton loader component
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`bg-muted/30 rounded animate-pulse ${className}`} />
}

export function formatMemory(gb: number): string {
  if (gb >= 1024) return `${(gb / 1024).toFixed(1)} TB`
  return `${Math.round(gb)} GB`
}
