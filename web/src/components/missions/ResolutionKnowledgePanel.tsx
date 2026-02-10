/**
 * Related Knowledge Panel
 *
 * Displays related resolutions from past missions in the fullscreen mission view.
 * Shows both personal and organization-shared resolutions sorted by effectiveness.
 */

import { useState } from 'react'
import {
  BookOpen,
  Star,
  Building2,
  ChevronDown,
  ChevronRight,
  CheckCircle,
  Clipboard,
  Plus,
} from 'lucide-react'
import type { SimilarResolution, Resolution, ResolutionSteps } from '../../hooks/useResolutions'
import { cn } from '../../lib/cn'

interface ResolutionKnowledgePanelProps {
  relatedResolutions: SimilarResolution[]
  onApplyResolution: (resolution: Resolution) => void
  onSaveNewResolution: () => void
}

export function ResolutionKnowledgePanel({
  relatedResolutions,
  onApplyResolution,
  onSaveNewResolution,
}: ResolutionKnowledgePanelProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Separate personal and shared
  const personalResolutions = relatedResolutions.filter(r => r.source === 'personal')
  const sharedResolutions = relatedResolutions.filter(r => r.source === 'shared')

  const toggleExpand = (id: string) => {
    setExpandedId(prev => prev === id ? null : id)
  }

  if (relatedResolutions.length === 0) {
    return (
      <div className="w-72 flex-shrink-0 flex flex-col gap-4 overflow-y-auto scroll-enhanced">
        <div className="bg-card border border-border rounded-lg p-4">
          <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-purple-400" />
            Related Knowledge
          </h4>
          <p className="text-xs text-muted-foreground mb-4">
            No similar resolutions found. Complete this mission successfully to save it for future reference.
          </p>
          <button
            onClick={onSaveNewResolution}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs bg-secondary/50 hover:bg-secondary border border-border rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Save This Resolution
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="w-72 flex-shrink-0 flex flex-col gap-4 overflow-y-auto scroll-enhanced">
      <div className="bg-card border border-border rounded-lg p-4">
        <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-purple-400" />
          Related Knowledge
        </h4>

        {/* Personal Resolutions */}
        {personalResolutions.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
              <Star className="w-3.5 h-3.5 text-yellow-400" />
              From Your History ({personalResolutions.length})
            </div>
            <div className="space-y-2">
              {personalResolutions.map(({ resolution }) => (
                <ResolutionCard
                  key={resolution.id}
                  resolution={resolution}
                  isExpanded={expandedId === resolution.id}
                  onToggle={() => toggleExpand(resolution.id)}
                  onApply={() => onApplyResolution(resolution)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Shared Resolutions */}
        {sharedResolutions.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
              <Building2 className="w-3.5 h-3.5 text-blue-400" />
              From Organization ({sharedResolutions.length})
            </div>
            <div className="space-y-2">
              {sharedResolutions.map(({ resolution }) => (
                <ResolutionCard
                  key={resolution.id}
                  resolution={resolution}
                  isExpanded={expandedId === resolution.id}
                  onToggle={() => toggleExpand(resolution.id)}
                  onApply={() => onApplyResolution(resolution)}
                  showSharedBy
                />
              ))}
            </div>
          </div>
        )}

        <button
          onClick={onSaveNewResolution}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs bg-secondary/50 hover:bg-secondary border border-border rounded-lg transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Save This Resolution
        </button>
      </div>
    </div>
  )
}

interface ResolutionCardProps {
  resolution: Resolution
  isExpanded: boolean
  onToggle: () => void
  onApply: () => void
  showSharedBy?: boolean
}

function ResolutionCard({
  resolution,
  isExpanded,
  onToggle,
  onApply,
  showSharedBy,
}: ResolutionCardProps) {
  const { effectiveness } = resolution
  const successRate = effectiveness.timesUsed > 0
    ? Math.round((effectiveness.timesSuccessful / effectiveness.timesUsed) * 100)
    : null

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
          <div className="flex items-center gap-2 mt-0.5">
            {successRate !== null && (
              <span className={cn(
                "text-[10px]",
                successRate >= 80 ? "text-green-400" :
                successRate >= 50 ? "text-yellow-400" : "text-muted-foreground"
              )}>
                {effectiveness.timesSuccessful}/{effectiveness.timesUsed} successful
              </span>
            )}
            {showSharedBy && resolution.sharedBy && (
              <span className="text-[10px] text-blue-400">
                by @{resolution.sharedBy}
              </span>
            )}
          </div>
        </div>
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="px-2.5 pb-2.5 border-t border-border/50">
          <div className="mt-2 space-y-2">
            {/* Issue Type */}
            <div className="text-[10px]">
              <span className="text-muted-foreground">Issue: </span>
              <span className="text-foreground">
                {resolution.issueSignature.type}
                {resolution.issueSignature.resourceKind && ` (${resolution.issueSignature.resourceKind})`}
              </span>
            </div>

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
            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onApply()
                }}
                className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-[10px] font-medium bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30 rounded transition-colors"
              >
                <CheckCircle className="w-3 h-3" />
                Apply
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  copyResolutionToClipboard(resolution.resolution)
                }}
                className="flex items-center justify-center gap-1.5 px-2 py-1.5 text-[10px] bg-secondary hover:bg-secondary/80 border border-border rounded transition-colors"
                title="Copy to clipboard"
              >
                <Clipboard className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function copyResolutionToClipboard(resolution: ResolutionSteps) {
  const text = [
    `Summary: ${resolution.summary}`,
    '',
    'Steps:',
    ...resolution.steps.map((s, i) => `${i + 1}. ${s}`),
    ...(resolution.yaml ? ['\nYAML:', '```yaml', resolution.yaml, '```'] : []),
  ].join('\n')

  navigator.clipboard.writeText(text)
}
