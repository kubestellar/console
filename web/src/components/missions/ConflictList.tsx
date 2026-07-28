import { ListOrdered, X } from 'lucide-react'
import type { TFunction } from 'i18next'

interface ConflictListProps {
  steps: string[]
  isBusy: boolean
  isGenerating: boolean
  onStepChange: (index: number, value: string) => void
  onAddStep: () => void
  onRemoveStep: (index: number) => void
  t: TFunction
}

export function ConflictList({
  steps,
  isBusy,
  isGenerating,
  onStepChange,
  onAddStep,
  onRemoveStep,
  t,
}: ConflictListProps) {
  return (
    <div>
      <label className="text-sm font-medium text-foreground flex items-center gap-2 mb-1.5">
        <ListOrdered className="w-4 h-4 text-muted-foreground" />
        {t('dashboard.missions.remediationSteps')}
      </label>
      <div className="space-y-2">
        {steps.map((step, index) => (
          <div key={index} className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground w-5">{index + 1}.</span>
            <input
              type="text"
              value={step}
              onChange={(e) => onStepChange(index, e.target.value)}
              placeholder={isGenerating ? t('dashboard.missions.generating') : t('dashboard.missions.stepPlaceholder')}
              disabled={isBusy}
              className="flex-1 px-3 py-1.5 text-sm bg-secondary/50 border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-primary disabled:opacity-50"
            />
            {steps.length > 1 && (
              <button
                onClick={() => onRemoveStep(index)}
                disabled={isBusy}
                className="p-1 hover:bg-red-500/20 rounded transition-colors disabled:opacity-50"
              >
                <X className="w-4 h-4 text-muted-foreground hover:text-red-400" />
              </button>
            )}
          </div>
        ))}
        <button
          onClick={onAddStep}
          disabled={isBusy}
          className="text-xs text-primary hover:text-primary/80 ml-7 disabled:opacity-50"
        >
          {t('dashboard.missions.addStep')}
        </button>
      </div>
    </div>
  )
}
