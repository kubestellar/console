import { motion } from 'framer-motion'
import { Loader2, Plus, Search, Sparkles } from 'lucide-react'
import { type RefObject } from 'react'
import { Button } from '../../ui/Button'
import { PayloadGrid } from '../PayloadGrid'
import type { Mission } from '../../../hooks/useMissions'
import type { MissionControlState, PayloadProject } from '../types'
import type { ManualWorkloadOption } from './fixerDefinitionPanel.constants'
import { ExecutiveAnalysis } from './ExecutiveAnalysis'
import { TargetClusterSelector } from './TargetClusterSelector'
import { AIStreamingPreview } from './AIStreamingPreview'
import { AISuggestErrorBanner } from './AISuggestErrorBanner'

interface FixerDefinitionFormProps {
  state: MissionControlState
  textareaRef: RefObject<HTMLTextAreaElement | null>
  placeholder: string
  aiStreaming: boolean
  planningMission: Mission | null | undefined
  latestAIContent: string
  latestSystemError: string
  planningFailed: boolean
  showManualAdd: boolean
  manualName: string
  manualSuggestions: ManualWorkloadOption[]
  manualHelperText: string
  manualAddDisabled: boolean
  installedProjects?: Set<string>
  onTitleChange: (title: string) => void
  onDescriptionChange: (description: string) => void
  onTargetClustersChange: (clusters: string[]) => void
  onSubmit: () => void
  onRetry: () => void
  onToggleManualAdd: () => void
  onManualNameChange: (name: string) => void
  onManualAdd: () => void
  onManualSuggestionSelect: (option: ManualWorkloadOption) => void
  onRemoveProject: (name: string) => void
  onUpdatePriority: (name: string, priority: PayloadProject['priority']) => void
  onCardClick: (project: PayloadProject) => void
}

export function FixerDefinitionForm({
  state,
  textareaRef,
  placeholder,
  aiStreaming,
  planningMission,
  latestAIContent,
  latestSystemError,
  planningFailed,
  showManualAdd,
  manualName,
  manualSuggestions,
  manualHelperText,
  manualAddDisabled,
  installedProjects,
  onTitleChange,
  onDescriptionChange,
  onTargetClustersChange,
  onSubmit,
  onRetry,
  onToggleManualAdd,
  onManualNameChange,
  onManualAdd,
  onManualSuggestionSelect,
  onRemoveProject,
  onUpdatePriority,
  onCardClick,
}: FixerDefinitionFormProps) {
  const modifierKeyLabel = typeof navigator !== 'undefined' && navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'

  return (
    <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-1">Define Your Mission</h2>
        <p className="text-sm text-muted-foreground">
          Describe the fix you want to deploy. AI will suggest the best CNCF
          projects and dependencies.
        </p>
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Mission Title
        </label>
        <input
          type="text"
          value={state.title}
          onChange={(event) => onTitleChange(event.target.value)}
          placeholder="e.g., Production Security Compliance"
          className="w-full mt-1 px-4 py-2 rounded-lg border border-border bg-secondary/30 text-sm focus:outline-hidden focus:ring-2 focus:ring-primary/50"
        />
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Describe Your Solution
        </label>
        <div className="relative mt-1">
          <textarea
            ref={textareaRef}
            value={state.description}
            onChange={(event) => onDescriptionChange(event.target.value)}
            placeholder={placeholder}
            rows={4}
            className="w-full px-4 py-3 rounded-lg border border-border bg-secondary/30 text-sm resize-none focus:outline-hidden focus:ring-2 focus:ring-primary/50 placeholder:text-muted-foreground/40 transition-colors"
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault()
                onSubmit()
              }
            }}
          />
          <div className="absolute right-2 bottom-2 flex items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground/50">{modifierKeyLabel}+Enter</span>
            <Button
              variant="primary"
              size="sm"
              onClick={onSubmit}
              disabled={aiStreaming}
              className="h-7 px-3"
              icon={aiStreaming ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            >
              {aiStreaming ? 'Thinking...' : state.projects.length > 0 ? 'Refine' : 'Suggest'}
            </Button>
          </div>
        </div>
      </div>

      <TargetClusterSelector selected={state.targetClusters} onChange={onTargetClustersChange} />

      {aiStreaming && <AIStreamingPreview planningMission={planningMission} />}

      {planningFailed && !aiStreaming && (
        <AISuggestErrorBanner
          errorContent={latestSystemError}
          onRetry={onRetry}
          disabled={!state.description.trim()}
        />
      )}

      {latestAIContent && !aiStreaming && (
        <ExecutiveAnalysis
          aiContent={latestAIContent}
          projects={state.originalAISuggestions || []}
          missionTitle={state.title}
          missionDescription={state.description}
        />
      )}

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium">Selected Payload</h3>
          <Button
            variant="secondary"
            size="sm"
            onClick={onToggleManualAdd}
            className="h-7 text-xs"
            icon={<Plus className="w-3 h-3" />}
          >
            Add Manually
          </Button>
        </div>

        {showManualAdd && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="mb-3 rounded-lg border border-border bg-secondary/20 p-3"
          >
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  type="text"
                  value={manualName}
                  onChange={(event) => onManualNameChange(event.target.value)}
                  placeholder="Search workloads (e.g., Falco, Tetragon, Prometheus)"
                  className="w-full pl-9 pr-3 py-1.5 text-sm rounded-lg border border-border bg-secondary/50 focus:outline-hidden focus:ring-1 focus:ring-primary"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      onManualAdd()
                    }
                  }}
                  autoFocus
                />
              </div>
              <Button variant="primary" size="sm" onClick={onManualAdd} disabled={manualAddDisabled}>
                Add
              </Button>
            </div>

            <p className="mt-2 text-xs text-muted-foreground">{manualHelperText}</p>

            {manualSuggestions.length > 0 && (
              <div className="mt-3 overflow-hidden rounded-lg border border-border/70 bg-background/60">
                {manualSuggestions.map((option, index) => (
                  <button
                    key={option.name}
                    type="button"
                    onClick={() => onManualSuggestionSelect(option)}
                    className="flex w-full items-start justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-secondary/70"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-foreground">{option.displayName}</div>
                      <div className="text-xs text-muted-foreground">{option.name}</div>
                    </div>
                    <div className="shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground">
                      {index === 0 ? 'Top match' : option.category}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        )}

        <PayloadGrid
          projects={state.projects}
          onRemoveProject={onRemoveProject}
          onUpdatePriority={onUpdatePriority}
          onClickProject={onCardClick}
          installedProjects={installedProjects}
        />
      </div>
    </div>
  )
}
