import { BookOpen, Bug, Loader2, Monitor, Sparkles } from 'lucide-react'
import type { TFunction } from 'i18next'
import { REWARD_ACTIONS } from '../../types/rewards'
import type { RequestType, TargetRepo } from './FeatureRequestTypes'
import { MIN_PARENT_ISSUE_NUMBER } from './submitTab.utils'

interface CategoryPickerProps {
  requestType: RequestType
  setRequestType: (value: RequestType) => void
  targetRepo: TargetRepo
  setTargetRepo: (value: TargetRepo) => void
  canLinkParentIssue: boolean
  isCheckingParentIssueAccess: boolean
  parentIssueNumber: string
  setParentIssueNumber: (value: string) => void
  inputsDisabled: boolean
  t: TFunction
}

export function CategoryPicker({
  requestType,
  setRequestType,
  targetRepo,
  setTargetRepo,
  canLinkParentIssue,
  isCheckingParentIssueAccess,
  parentIssueNumber,
  setParentIssueNumber,
  inputsDisabled,
  t,
}: CategoryPickerProps) {
  return (
    <>
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

      {(requestType === 'bug' && (canLinkParentIssue || isCheckingParentIssueAccess)) && (
        <details className="rounded-lg border border-border bg-secondary/20 px-3 py-2">
          <summary className="cursor-pointer list-none text-xs font-medium text-foreground">
            {t('feedback.linkToParentIssue', 'Link to parent issue')}
          </summary>
          <div className="mt-3 space-y-2">
            {isCheckingParentIssueAccess ? (
              <div className="flex items-center gap-2 text-2xs text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin" />
                <p>{t('feedback.checkingIssueLinkAccess', 'Checking repository access…')}</p>
              </div>
            ) : canLinkParentIssue ? (
              <>
                <label htmlFor="feedback-parent-issue" className="block text-xs font-medium text-muted-foreground">
                  {t('feedback.parentIssueNumber', 'Parent issue number')}
                </label>
                <input
                  id="feedback-parent-issue"
                  type="number"
                  min={MIN_PARENT_ISSUE_NUMBER}
                  inputMode="numeric"
                  value={parentIssueNumber}
                  onChange={e => setParentIssueNumber(e.target.value)}
                  disabled={inputsDisabled}
                  placeholder="12345"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-hidden transition-colors focus:border-purple-500 disabled:opacity-60"
                />
                <p className="text-2xs text-muted-foreground">
                  {t('feedback.parentIssueHelp', 'If provided, this report will be linked as a child issue after submission.')}
                </p>
              </>
            ) : null}
          </div>
        </details>
      )}
    </>
  )
}
