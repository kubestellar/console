import { Bug, Sparkles, Monitor, BookOpen } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { REWARD_ACTIONS } from '../../types/rewards'
import type { RequestType, TargetRepo } from './FeatureRequestTypes'

interface CategoryPickerProps {
  requestType: RequestType
  setRequestType: (v: RequestType) => void
  targetRepo: TargetRepo
  setTargetRepo: (v: TargetRepo) => void
  inputsDisabled: boolean
}

export function CategoryPicker({ requestType, setRequestType, targetRepo, setTargetRepo, inputsDisabled }: CategoryPickerProps) {
  const { t } = useTranslation()
  return (
    <>
      {/* Type Selection */}
      <fieldset
        disabled={inputsDisabled}
        className="flex gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
        aria-disabled={inputsDisabled}
      >
        <button
          type="button"
          onClick={() => setRequestType('bug')}
          disabled={inputsDisabled}
          className={`flex-1 p-3 rounded-lg border transition-colors flex items-center justify-center gap-2 disabled:cursor-not-allowed ${
            requestType === 'bug'
              ? 'bg-red-500/20 border-red-500/50 text-red-400'
              : 'border-border text-muted-foreground hover:border-muted-foreground'
          }`}
        >
          <Bug className="w-4 h-4" />
          {t('feedback.bugReport')}
          <span className="text-2xs text-muted-foreground">
            +{REWARD_ACTIONS.bug_report.coins}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setRequestType('feature')}
          disabled={inputsDisabled}
          className={`flex-1 p-3 rounded-lg border transition-colors flex items-center justify-center gap-2 disabled:cursor-not-allowed ${
            requestType === 'feature'
              ? 'bg-purple-500/20 border-purple-500/50 text-purple-400'
              : 'border-border text-muted-foreground hover:border-muted-foreground'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          {t('feedback.featureRequest')}
          <span className="text-2xs text-muted-foreground">
            +{REWARD_ACTIONS.feature_suggestion.coins}
          </span>
        </button>
      </fieldset>

      {/* Repository selector */}
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1.5">
          Where does this issue belong?
        </label>
        <fieldset
          disabled={inputsDisabled}
          className="flex gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
          aria-disabled={inputsDisabled}
        >
          <button
            type="button"
            onClick={() => setTargetRepo('console')}
            disabled={inputsDisabled}
            className={`flex-1 p-2.5 rounded-lg border transition-colors flex items-center justify-center gap-2 disabled:cursor-not-allowed ${
              targetRepo === 'console'
                ? 'bg-blue-500/20 border-blue-500/50 text-blue-400'
                : 'border-border text-muted-foreground hover:border-muted-foreground'
            }`}
          >
            <Monitor className="w-4 h-4" />
            <span className="text-sm">Console App</span>
          </button>
          <button
            type="button"
            onClick={() => setTargetRepo('docs')}
            disabled={inputsDisabled}
            className={`flex-1 p-2.5 rounded-lg border transition-colors flex items-center justify-center gap-2 disabled:cursor-not-allowed ${
              targetRepo === 'docs'
                ? 'bg-amber-500/20 border-amber-500/50 text-amber-400'
                : 'border-border text-muted-foreground hover:border-muted-foreground'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span className="text-sm">Console Docs</span>
          </button>
        </fieldset>
        {targetRepo === 'docs' && (
          <p className="text-2xs text-amber-400/80 mt-1">
            This issue will be filed on <span className="font-mono">kubestellar/docs</span>
          </p>
        )}
      </div>
    </>
  )
}
