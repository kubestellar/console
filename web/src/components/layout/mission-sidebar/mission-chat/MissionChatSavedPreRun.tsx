import { Check, ChevronLeft, ListChecks, Pencil, Play, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { Mission } from '../../../../hooks/useMissions'
import { cn } from '../../../../lib/cn'

interface MissionChatSavedPreRunProps {
  descriptionRef: React.RefObject<HTMLTextAreaElement | null>
  editDescription: string
  editSteps: Array<{ title: string; description: string }>
  isEditingMission: boolean
  mission: Mission
  onBack: () => void
  onCancelEdits: () => void
  onRun: () => void
  onRunFromKeyboard: () => void
  onSaveEdits: () => void
  onSubmitEditsAndRun: () => void
  onSetEditDescription: (value: string) => void
  onStartEditingMission: () => void
  onUpdateStep: (idx: number, field: 'title' | 'description', value: string) => void
}

export function MissionChatSavedPreRun({
  descriptionRef,
  editDescription,
  editSteps,
  isEditingMission,
  mission,
  onBack,
  onCancelEdits,
  onRun,
  onRunFromKeyboard,
  onSaveEdits,
  onSubmitEditsAndRun,
  onSetEditDescription,
  onStartEditingMission,
  onUpdateStep,
}: MissionChatSavedPreRunProps) {
  const { t } = useTranslation('common')
  const readOnlySteps = mission.importedFrom?.steps || []
  const visibleSteps = isEditingMission ? editSteps : readOnlySteps

  return (
    <div
      className="flex flex-col gap-4 py-4"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && !event.metaKey && !event.ctrlKey && !event.shiftKey && !isEditingMission) {
          const tagName = (event.target as HTMLElement).tagName
          if (tagName !== 'INPUT' && tagName !== 'TEXTAREA') {
            event.preventDefault()
            onRunFromKeyboard()
          }
        }
      }}
      data-testid="saved-mission-prerun"
    >
      <div className="flex flex-col items-center gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={onRun}
            className="flex items-center justify-center gap-2 px-8 py-3 text-sm font-semibold bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-all hover:scale-[1.02] active:scale-[0.98]"
            data-testid="run-mission-btn"
          >
            <Play className="w-4 h-4" />
            {t('missionChat.runMission', { defaultValue: 'Run Mission' })}
          </button>
          {!isEditingMission && (
            <button
              onClick={onStartEditingMission}
              className="flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium border border-border rounded-lg hover:bg-secondary/50 transition-all"
              title={t('missionChat.editBeforeRunning', { defaultValue: 'Edit before running' })}
              data-testid="edit-mission-btn"
            >
              <Pencil className="w-4 h-4" />
              {t('missionChat.edit', { defaultValue: 'Edit' })}
            </button>
          )}
          {isEditingMission && (
            <div className="flex items-center gap-1">
              <button
                onClick={onSaveEdits}
                className="flex items-center justify-center gap-1 px-3 py-3 text-sm font-medium text-green-400 border border-green-500/30 rounded-lg hover:bg-green-500/10 transition-all"
                title={t('common.save', { defaultValue: 'Save' })}
                data-testid="save-mission-edits-btn"
              >
                <Check className="w-4 h-4" />
                {t('common.save', { defaultValue: 'Save' })}
              </button>
              <button
                onClick={onCancelEdits}
                className="flex items-center justify-center gap-1 px-3 py-3 text-sm font-medium text-muted-foreground border border-border rounded-lg hover:bg-secondary/50 transition-all"
                title={t('common.cancel', { defaultValue: 'Cancel' })}
                data-testid="cancel-mission-edits-btn"
              >
                <X className="w-4 h-4" />
                {t('common.cancel', { defaultValue: 'Cancel' })}
              </button>
            </div>
          )}
        </div>
        <p className="text-2xs text-muted-foreground">
          {isEditingMission
            ? t('missionChat.editHint', { defaultValue: 'Edit the description and steps below, then Run or press Enter' })
            : t('missionChat.runHint', { defaultValue: 'Press Enter to run, or Edit to customize first' })}
        </p>
        <button
          onClick={onBack}
          className="flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="w-3 h-3" />
          {t('missionChat.backToMissions')}
        </button>
      </div>

      {isEditingMission ? (
        <div className="mx-1 rounded-lg border border-primary/30 bg-secondary/30 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50 bg-secondary/50">
            <Pencil className="w-4 h-4 text-primary" />
            <span className="text-xs font-semibold text-foreground">
              {t('missionChat.missionDescription', { defaultValue: 'Mission Description' })}
            </span>
          </div>
          <div className="p-2">
            <textarea
              ref={descriptionRef}
              value={editDescription}
              onChange={(event) => onSetEditDescription(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault()
                  onSubmitEditsAndRun()
                } else if (event.key === 'Escape') {
                  event.preventDefault()
                  onCancelEdits()
                }
              }}
              className="w-full min-h-[60px] p-2 text-sm bg-background border border-border rounded-md resize-y focus:outline-hidden focus:ring-1 focus:ring-primary/50 text-foreground"
              placeholder={t('missionChat.descriptionPlaceholder', { defaultValue: 'Describe what this mission should do...' })}
              data-testid="edit-mission-description"
            />
          </div>
        </div>
      ) : (
        mission.description && (
          <div className="mx-1 px-3 py-2 text-sm text-muted-foreground whitespace-pre-wrap break-words rounded-lg bg-secondary/20 border border-border/50">
            {mission.description}
          </div>
        )
      )}

      {((isEditingMission && editSteps.length > 0) || (!isEditingMission && readOnlySteps.length > 0)) && (
        <div className={cn(
          'mx-1 rounded-lg border bg-secondary/30 overflow-hidden',
          isEditingMission ? 'border-primary/30' : 'border-border',
        )}>
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50 bg-secondary/50">
            <ListChecks className="w-4 h-4 text-purple-400" />
            <span className="text-xs font-semibold text-foreground">
              {t('missionChat.missionSteps', { defaultValue: 'Mission Steps' })}
            </span>
            <span className="ml-auto text-2xs text-muted-foreground">
              {visibleSteps.length} {visibleSteps.length === 1 ? 'step' : 'steps'}
            </span>
          </div>
          <div className="p-2 space-y-2 max-h-[50vh] overflow-y-auto scroll-enhanced">
            {isEditingMission
              ? editSteps.map((step, idx) => (
                  <div key={idx} className="flex gap-2.5 p-2.5 rounded-md bg-background/50 border border-primary/20">
                    <span className="shrink-0 w-5 h-5 flex items-center justify-center rounded-full bg-purple-500/20 text-purple-400 text-2xs font-bold mt-1">
                      {idx + 1}
                    </span>
                    <div className="flex-1 min-w-0 space-y-1">
                      <input
                        type="text"
                        value={step.title}
                        onChange={(event) => onUpdateStep(idx, 'title', event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                            event.preventDefault()
                            onSubmitEditsAndRun()
                          } else if (event.key === 'Escape') {
                            event.preventDefault()
                            onCancelEdits()
                          }
                        }}
                        className="w-full px-2 py-1 text-sm font-medium bg-background border border-border rounded text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary/50"
                        placeholder={t('missionChat.stepTitlePlaceholder', { defaultValue: 'Step title...' })}
                        data-testid={`edit-step-title-${idx}`}
                      />
                      <textarea
                        value={step.description}
                        onChange={(event) => onUpdateStep(idx, 'description', event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                            event.preventDefault()
                            onSubmitEditsAndRun()
                          } else if (event.key === 'Escape') {
                            event.preventDefault()
                            onCancelEdits()
                          }
                        }}
                        className="w-full px-2 py-1 text-xs bg-background border border-border rounded text-muted-foreground resize-y min-h-[40px] focus:outline-hidden focus:ring-1 focus:ring-primary/50"
                        placeholder={t('missionChat.stepDescPlaceholder', { defaultValue: 'Step description...' })}
                        data-testid={`edit-step-desc-${idx}`}
                      />
                    </div>
                  </div>
                ))
              : readOnlySteps.map((step, idx) => (
                  <div key={idx} className="flex gap-2.5 p-2.5 rounded-md bg-background/50 border border-border/50">
                    <span className="shrink-0 w-5 h-5 flex items-center justify-center rounded-full bg-purple-500/20 text-purple-400 text-2xs font-bold">
                      {idx + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{step.title}</p>
                      {step.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-3 whitespace-pre-wrap">{step.description}</p>
                      )}
                    </div>
                  </div>
                ))}
          </div>
        </div>
      )}
    </div>
  )
}
