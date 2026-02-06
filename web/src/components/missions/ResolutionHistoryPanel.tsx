/**
 * Resolution History Panel
 *
 * Shows all saved resolutions (personal and shared) with ability to view, delete, and share.
 * Displayed in the fullscreen mission view sidebar.
 */

import { useState } from 'react'
import {
  BookMarked,
  Star,
  Building2,
  ChevronDown,
  ChevronRight,
  Trash2,
  Share2,
  CheckCircle,
  Clock,
  Tag,
  AlertCircle,
} from 'lucide-react'
import { useResolutions, type Resolution } from '../../hooks/useResolutions'
import { cn } from '../../lib/cn'

interface ResolutionHistoryPanelProps {
  onApplyResolution?: (resolution: Resolution) => void
}

export function ResolutionHistoryPanel({ onApplyResolution }: ResolutionHistoryPanelProps) {
  const { resolutions, sharedResolutions, deleteResolution, shareResolution } = useResolutions()
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showPersonal, setShowPersonal] = useState(true)
  const [showShared, setShowShared] = useState(true)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  const toggleExpand = (id: string) => {
    setExpandedId(prev => prev === id ? null : id)
  }

  const handleDelete = (id: string) => {
    if (deleteConfirmId === id) {
      deleteResolution(id)
      setDeleteConfirmId(null)
      setExpandedId(null)
    } else {
      setDeleteConfirmId(id)
      // Auto-clear confirm after 3s
      setTimeout(() => setDeleteConfirmId(prev => prev === id ? null : prev), 3000)
    }
  }

  const handleShare = (id: string) => {
    shareResolution(id)
  }

  const totalResolutions = resolutions.length + sharedResolutions.length

  if (totalResolutions === 0) {
    return (
      <div className="w-72 flex-shrink-0 flex flex-col gap-4 overflow-y-auto">
        <div className="bg-card border border-border rounded-lg p-4">
          <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <BookMarked className="w-4 h-4 text-purple-400" />
            Resolution History
          </h4>
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <AlertCircle className="w-8 h-8 text-muted-foreground/50 mb-2" />
            <p className="text-xs text-muted-foreground mb-1">
              No saved resolutions yet
            </p>
            <p className="text-[10px] text-muted-foreground/70">
              Complete a mission and save the resolution to build your knowledge base
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="w-72 flex-shrink-0 flex flex-col gap-4 overflow-y-auto">
      <div className="bg-card border border-border rounded-lg p-4">
        <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <BookMarked className="w-4 h-4 text-purple-400" />
          Resolution History
          <span className="ml-auto text-xs text-muted-foreground font-normal">
            {totalResolutions} saved
          </span>
        </h4>

        {/* Personal Resolutions */}
        {resolutions.length > 0 && (
          <div className="mb-4">
            <button
              onClick={() => setShowPersonal(!showPersonal)}
              className="w-full flex items-center gap-2 text-xs text-muted-foreground mb-2 hover:text-foreground transition-colors"
            >
              {showPersonal ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              <Star className="w-3.5 h-3.5 text-yellow-400" />
              Your Resolutions ({resolutions.length})
            </button>
            {showPersonal && (
              <div className="space-y-2">
                {resolutions.map(resolution => (
                  <ResolutionCard
                    key={resolution.id}
                    resolution={resolution}
                    isExpanded={expandedId === resolution.id}
                    onToggle={() => toggleExpand(resolution.id)}
                    onApply={onApplyResolution ? () => onApplyResolution(resolution) : undefined}
                    onDelete={() => handleDelete(resolution.id)}
                    onShare={() => handleShare(resolution.id)}
                    isDeleteConfirm={deleteConfirmId === resolution.id}
                    canShare
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Shared Resolutions */}
        {sharedResolutions.length > 0 && (
          <div>
            <button
              onClick={() => setShowShared(!showShared)}
              className="w-full flex items-center gap-2 text-xs text-muted-foreground mb-2 hover:text-foreground transition-colors"
            >
              {showShared ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              <Building2 className="w-3.5 h-3.5 text-blue-400" />
              Team Shared ({sharedResolutions.length})
            </button>
            {showShared && (
              <div className="space-y-2">
                {sharedResolutions.map(resolution => (
                  <ResolutionCard
                    key={resolution.id}
                    resolution={resolution}
                    isExpanded={expandedId === resolution.id}
                    onToggle={() => toggleExpand(resolution.id)}
                    onApply={onApplyResolution ? () => onApplyResolution(resolution) : undefined}
                    onDelete={() => handleDelete(resolution.id)}
                    isDeleteConfirm={deleteConfirmId === resolution.id}
                    showSharedBy
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

interface ResolutionCardProps {
  resolution: Resolution
  isExpanded: boolean
  onToggle: () => void
  onApply?: () => void
  onDelete: () => void
  onShare?: () => void
  isDeleteConfirm: boolean
  showSharedBy?: boolean
  canShare?: boolean
}

function ResolutionCard({
  resolution,
  isExpanded,
  onToggle,
  onApply,
  onDelete,
  onShare,
  isDeleteConfirm,
  showSharedBy,
  canShare,
}: ResolutionCardProps) {
  const { effectiveness } = resolution
  const successRate = effectiveness.timesUsed > 0
    ? Math.round((effectiveness.timesSuccessful / effectiveness.timesUsed) * 100)
    : null

  const formattedDate = new Date(resolution.createdAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })

  return (
    <div className="border border-border rounded-lg bg-secondary/30 overflow-hidden">
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-start gap-2 p-2.5 text-left hover:bg-secondary/50 transition-colors"
      >
        {isExpanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-foreground truncate">
              {resolution.title}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Tag className="w-2.5 h-2.5" />
              {resolution.issueSignature.type}
            </span>
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Clock className="w-2.5 h-2.5" />
              {formattedDate}
            </span>
            {successRate !== null && (
              <span className={cn(
                "text-[10px]",
                successRate >= 80 ? "text-green-400" :
                successRate >= 50 ? "text-yellow-400" : "text-muted-foreground"
              )}>
                {effectiveness.timesSuccessful}/{effectiveness.timesUsed}
              </span>
            )}
            {showSharedBy && resolution.sharedBy && (
              <span className="text-[10px] text-blue-400">
                @{resolution.sharedBy}
              </span>
            )}
          </div>
        </div>
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="px-2.5 pb-2.5 border-t border-border/50">
          <div className="mt-2 space-y-2">
            {/* Summary */}
            <div className="text-xs text-foreground leading-relaxed">
              {resolution.resolution.summary}
            </div>

            {/* Steps Preview */}
            {resolution.resolution.steps.length > 0 && (
              <div className="text-[10px] space-y-1">
                <span className="text-muted-foreground">Steps:</span>
                <ol className="list-decimal list-inside space-y-0.5 text-foreground">
                  {resolution.resolution.steps.slice(0, 3).map((step, i) => (
                    <li key={i} className="truncate">{step}</li>
                  ))}
                  {resolution.resolution.steps.length > 3 && (
                    <li className="text-muted-foreground">
                      +{resolution.resolution.steps.length - 3} more...
                    </li>
                  )}
                </ol>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-1.5 pt-2">
              {onApply && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onApply()
                  }}
                  className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-[10px] font-medium bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30 rounded transition-colors"
                >
                  <CheckCircle className="w-3 h-3" />
                  Apply
                </button>
              )}
              {canShare && onShare && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onShare()
                  }}
                  className="flex items-center justify-center gap-1 px-2 py-1.5 text-[10px] bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 border border-blue-500/30 rounded transition-colors"
                  title="Share to team"
                >
                  <Share2 className="w-3 h-3" />
                </button>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete()
                }}
                className={cn(
                  "flex items-center justify-center gap-1 px-2 py-1.5 text-[10px] rounded transition-colors",
                  isDeleteConfirm
                    ? "bg-red-500 text-white"
                    : "bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30"
                )}
                title={isDeleteConfirm ? "Click again to confirm" : "Delete"}
              >
                <Trash2 className="w-3 h-3" />
                {isDeleteConfirm && <span>Confirm</span>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
