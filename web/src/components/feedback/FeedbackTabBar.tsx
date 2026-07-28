import { Bug, Lightbulb } from 'lucide-react'
import type { TFunction } from 'i18next'
import { moveFocusByKey } from '../../lib/a11y/rovingFocus'
import { REWARD_ACTIONS } from '../../hooks/useRewards'
import { StatusBadge } from '../ui/StatusBadge'
import { RatingSelector, type RatingSelectorOption } from './RatingSelector'

export type FeedbackType = 'bug' | 'feature'

interface FeedbackTabBarProps {
  type: FeedbackType
  setType: (value: FeedbackType) => void
  t: TFunction
}

export function FeedbackTabBar({ type, setType, t }: FeedbackTabBarProps) {
  const options: RatingSelectorOption<FeedbackType>[] = [
    {
      value: 'bug',
      label: t('feedback.bugReport', 'Bug Report'),
      icon: <Bug className="w-4 h-4" />,
      rightContent: <StatusBadge color="yellow">+{REWARD_ACTIONS.bug_report.coins}</StatusBadge>,
      activeClassName: 'bg-red-500/10 border-red-500/30 text-red-400',
      inactiveClassName: 'bg-secondary/30 border-border text-muted-foreground hover:text-foreground',
      activeRingClassName: 'focus-visible:ring-2 focus-visible:ring-red-500/70',
    },
    {
      value: 'feature',
      label: t('feedback.featureRequest', 'Feature Request'),
      icon: <Lightbulb className="w-4 h-4" />,
      rightContent: <StatusBadge color="yellow">+{REWARD_ACTIONS.feature_suggestion.coins}</StatusBadge>,
      activeClassName: 'bg-green-500/10 border-green-500/30 text-green-400',
      inactiveClassName: 'bg-secondary/30 border-border text-muted-foreground hover:text-foreground',
      activeRingClassName: 'focus-visible:ring-2 focus-visible:ring-green-500/70',
    },
  ]

  return (
    <RatingSelector
      value={type}
      onChange={setType}
      options={options}
      className="flex gap-2 mb-4"
      ariaLabel={t('feedback.feedbackType', 'Feedback type')}
      onKeyDown={(event) => {
        const next = moveFocusByKey(event, { selector: '[role="radio"]:not([disabled])', orientation: 'horizontal' })
        const nextType = next?.dataset.radioValue as FeedbackType | undefined
        if (nextType) {
          setType(nextType)
        }
      }}
    />
  )
}
