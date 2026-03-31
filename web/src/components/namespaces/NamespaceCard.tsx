import { Folder, Trash2, ChevronRight } from 'lucide-react'
import { ClusterBadge } from '../ui/ClusterBadge'
import type { NamespaceDetails } from './types'

interface NamespaceCardProps {
  namespace: NamespaceDetails
  isSelected: boolean
  onSelect: () => void
  onDelete?: () => void
  isSystem?: boolean
  showCluster?: boolean
}

export function NamespaceCard({ namespace, isSelected, onSelect, onDelete, isSystem, showCluster = true }: NamespaceCardProps) {
  return (
    <div
      onClick={onSelect}
      className={`flex items-center gap-4 p-4 rounded-lg cursor-pointer transition-colors group ${
        isSelected
          ? 'bg-blue-500/20 border border-blue-500/50'
          : 'bg-secondary/30 hover:bg-secondary/50 border border-transparent'
      }`}
    >
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
        isSystem ? 'bg-gray-500/20' : 'bg-blue-500/20'
      }`}>
        <Folder className={`w-5 h-5 ${isSystem ? 'text-muted-foreground' : 'text-blue-400'}`} />
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-white">{namespace.name}</span>
          <span className={`text-xs px-1.5 py-0.5 rounded ${
            namespace.status === 'Active'
              ? 'bg-green-500/20 text-green-400'
              : 'bg-yellow-500/20 text-yellow-400'
          }`}>
            {namespace.status}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          Created {new Date(namespace.createdAt).toLocaleDateString()}
        </p>
      </div>
      {showCluster && <ClusterBadge cluster={namespace.cluster} size="sm" />}
      {!isSystem && onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          className="p-2 rounded text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100"
          title="Delete namespace"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}
      <ChevronRight className="w-4 h-4 text-muted-foreground" />
    </div>
  )
}

export function NamespaceCardSkeleton() {
  return (
    <div className="flex items-center gap-4 p-4 rounded-lg bg-secondary/30 border border-transparent animate-pulse">
      {/* Icon placeholder */}
      <div className="w-10 h-10 rounded-lg bg-secondary/50" />

      {/* Content placeholder */}
      <div className="flex-1 space-y-2">
        <div className="flex items-center gap-2">
          <div className="h-4 w-32 bg-secondary/50 rounded" />
          <div className="h-4 w-14 bg-secondary/50 rounded" />
        </div>
        <div className="h-3 w-24 bg-secondary/50 rounded" />
      </div>

      {/* Cluster badge placeholder */}
      <div className="h-6 w-20 bg-secondary/50 rounded-full" />

      {/* Chevron placeholder */}
      <div className="w-4 h-4 bg-secondary/50 rounded" />
    </div>
  )
}
