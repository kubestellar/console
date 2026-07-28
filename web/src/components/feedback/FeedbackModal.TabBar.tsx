import { Bug, Lightbulb } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { StatusBadge } from '../ui/StatusBadge'
import { REWARD_ACTIONS } from '../../hooks/useRewards'
import { moveFocusByKey } from '../../lib/a11y/rovingFocus'

type FeedbackType = 'bug' | 'feature'

interface FeedbackTabBarProps {
  type: FeedbackType
  onChange: (type: FeedbackType) => void
}

export function FeedbackTabBar({ type, onChange }: FeedbackTabBarProps) {
  const { t } = useTranslation(['common'])
  return (
    <div
      role="radiogroup"
      aria-label={t('feedback.feedbackType', 'Feedback type')}
      className="flex gap-2 mb-4"
      onKeyDown={(e) => {
        const next = moveFocusByKey(e, { selector: '[role="radio"]:not([disabled])', orientation: 'horizontal' })
        const nextType = next?.dataset.radioValue as FeedbackType | undefined
        if (nextType) onChange(nextType)
      }}
    >
      <button
        type="button"
        role="radio"
        aria-checked={type === 'bug'}
        tabIndex={type === 'bug' ? 0 : -1}
        data-radio-value="bug"
        onClick={() => onChange('bug')}
        className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/70 ${
          type === 'bug'
            ? 'bg-red-500/10 border-red-500/30 text-red-400'
            : 'bg-secondary/30 border-border text-muted-foreground hover:text-foreground'
        }`}
      >
        <Bug className="w-4 h-4" />
        <span className="text-sm font-medium">{t('feedback.bugReport', 'Bug Report')}</span>
        <StatusBadge color="yellow">+{REWARD_ACTIONS.bug_report.coins}</StatusBadge>
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={type === 'feature'}
        tabIndex={type === 'feature' ? 0 : -1}
        data-radio-value="feature"
        onClick={() => onChange('feature')}
        className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500/70 ${
          type === 'feature'
            ? 'bg-green-500/10 border-green-500/30 text-green-400'
            : 'bg-secondary/30 border-border text-muted-foreground hover:text-foreground'
        }`}
      >
        <Lightbulb className="w-4 h-4" />
        <span className="text-sm font-medium">{t('feedback.featureRequest', 'Feature Request')}</span>
        <StatusBadge color="yellow">+{REWARD_ACTIONS.feature_suggestion.coins}</StatusBadge>
      </button>
    </div>
  )
}
