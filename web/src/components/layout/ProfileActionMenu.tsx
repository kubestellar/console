import { useTranslation } from 'react-i18next'
import { Download, LogOut, Lightbulb } from 'lucide-react'
import { Linkedin } from '@/lib/icons'
import { REWARD_ACTIONS } from '../../hooks/useRewards'
import type { RewardActionType } from '../../types/rewards'
import { isDemoModeForced } from '../../lib/demoMode'
import { emitLinkedInShare } from '../../lib/analytics'
import { ThemeToggleRow } from './ThemeToggleRow'

// ─── ProfileActionMenu ────────────────────────────────────────────────────────

interface ProfileActionMenuProps {
  closeDropdown: () => void
  openFeedbackModal: () => void
  awardCoins: (action: RewardActionType, metadata?: Record<string, unknown>) => boolean
  onShowSetupDialog: () => void
  onPreferences?: () => void
  onShowLogoutConfirm: () => void
}

export function ProfileActionMenu({
  closeDropdown,
  openFeedbackModal,
  awardCoins,
  onShowSetupDialog,
  onPreferences,
  onShowLogoutConfirm,
}: ProfileActionMenuProps) {
  const { t } = useTranslation()

  const handleLinkedInShare = () => {
    const linkedInUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent('https://kubestellar.io')}`
    window.open(linkedInUrl, '_blank', 'noopener,noreferrer,width=600,height=600')
    emitLinkedInShare('profile_dropdown')
    awardCoins('linkedin_share')
    closeDropdown()
  }

  return (
    <div className="p-2 space-y-1">
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          closeDropdown()
          openFeedbackModal()
        }}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-foreground hover:bg-secondary rounded-lg transition-colors"
      >
        <Lightbulb className="w-4 h-4 text-yellow-500" />
        <span>{t('feedback.feedback')}</span>
        <span className="ml-auto text-xs px-1.5 py-0.5 rounded bg-yellow-900 text-yellow-400">{t('feedback.plusCoins')}</span>
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={handleLinkedInShare}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-foreground hover:bg-secondary rounded-lg transition-colors"
      >
        <Linkedin className="w-4 h-4 text-linkedin" />
        <span>{t('feedback.shareOnLinkedIn')}</span>
        <span className="ml-auto text-xs px-1.5 py-0.5 rounded bg-yellow-900 text-yellow-400">+{REWARD_ACTIONS.linkedin_share.coins}</span>
      </button>

      <ThemeToggleRow
        onClick={() => {
          closeDropdown()
          onPreferences?.()
        }}
        label={t('settings.title')}
      />

      <button
        type="button"
        role="menuitem"
        onClick={() => {
          closeDropdown()
          if (isDemoModeForced) {
            onShowSetupDialog()
          } else {
            onShowLogoutConfirm()
          }
        }}
        className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm rounded-lg transition-colors ${
          isDemoModeForced
            ? 'text-purple-400 hover:bg-purple-950'
            : 'text-red-400 hover:bg-red-950'
        }`}
      >
        {isDemoModeForced ? (
          <>
            <Download className="w-4 h-4" />
            {t('actions.getYourOwn')}
          </>
        ) : (
          <>
            <LogOut className="w-4 h-4" />
            {t('actions.signOut')}
          </>
        )}
      </button>
    </div>
  )
}
