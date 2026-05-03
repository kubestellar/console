/**
 * Contextual Nudge Banner — non-intrusive hint shown at the right moment.
 *
 * Replaces the traditional tour with context-aware nudges:
 *   - 'customize' — suggest customizing the dashboard after 3+ visits
 *   - 'pwa-install' — suggest installing the PWA after 3+ sessions
 */

import { useTranslation } from 'react-i18next'
import { Palette, Download, X } from 'lucide-react'
import type { NudgeType } from '../../hooks/useContextualNudges'

interface ContextualNudgeBannerProps {
  nudgeType: NudgeType
  onAction: () => void
  onDismiss: () => void
}

const NUDGE_CONFIG: Record<NudgeType, {
  icon: typeof Palette
  titleKey: string
  titleFallback: string
  descriptionKey: string
  descriptionFallback: string
  actionKey: string
  actionFallback: string
  accentClass: string
}> = {
  customize: {
    icon: Palette,
    titleKey: 'nudge.customize.title',
    titleFallback: 'Make it yours',
    descriptionKey: 'nudge.customize.description',
    descriptionFallback: 'Drag cards to rearrange, click + to add new ones, or try a template.',
    actionKey: 'nudge.customize.action',
    actionFallback: 'Add a card',
    accentClass: 'border-blue-500/30 bg-blue-500/5',
  },
  'pwa-install': {
    icon: Download,
    titleKey: 'nudge.pwa.title',
    titleFallback: 'Quick access',
    descriptionKey: 'nudge.pwa.description',
    descriptionFallback: 'Install the KubeStellar Console widget for instant cluster status from your desktop.',
    actionKey: 'nudge.pwa.action',
    actionFallback: 'Install widget',
    accentClass: 'border-purple-500/30 bg-purple-500/5',
  },
  // drag-hint is handled by CSS animation, not a banner
  'drag-hint': {
    icon: Palette,
    titleKey: '',
    titleFallback: '',
    descriptionKey: '',
    descriptionFallback: '',
    actionKey: '',
    actionFallback: '',
    accentClass: '',
  },
}

export function ContextualNudgeBanner({ nudgeType, onAction, onDismiss }: ContextualNudgeBannerProps) {
  const { t } = useTranslation()

  // drag-hint is handled differently (CSS animation on cards)
  if (nudgeType === 'drag-hint') return null

  const config = NUDGE_CONFIG[nudgeType]
  const Icon = config.icon

  return (
    <div className={`mb-4 rounded-xl border ${config.accentClass} px-4 py-3 animate-in slide-in-from-top-2 duration-300`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
          <div>
            <span className="text-sm font-medium text-foreground">
              {t(config.titleKey, config.titleFallback)}
            </span>
            <span className="text-sm text-muted-foreground ml-2">
              {t(config.descriptionKey, config.descriptionFallback)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-4">
          <button
            onClick={onAction}
            className="text-xs font-medium text-purple-400 hover:text-purple-300 transition-colors px-3 py-1.5 rounded-lg hover:bg-purple-500/10"
          >
            {t(config.actionKey, config.actionFallback)}
          </button>
          <button
            onClick={onDismiss}
            className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            title={t('common.dismiss', 'Dismiss')}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
