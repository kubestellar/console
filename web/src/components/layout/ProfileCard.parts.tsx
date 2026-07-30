import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  User, MessageSquare, Shield, ChevronDown, Coins,
  Code2, Rocket, KeyRound, ExternalLink, CheckCircle2, XCircle, GitBranch,
  Download, LogOut, Lightbulb,
} from 'lucide-react'
import { Linkedin } from '@/lib/icons'
import { Tooltip } from '../ui/Tooltip'
import { useVersionCheck } from '../../hooks/useVersionCheck'
import { REWARD_ACTIONS } from '../../hooks/useRewards'
import type { RewardActionType } from '../../types/rewards'
import { checkOAuthConfigured } from '../../lib/api'
import { isDemoModeForced } from '../../lib/demoMode'
import { LANGUAGE_STORAGE_KEY, languages } from '../../lib/i18n'
import { emitLinkedInShare, emitLanguageChanged } from '../../lib/analytics'
import { safeSetItem } from '../../lib/utils/localStorage'
import { OrgSwitcher } from './OrgSwitcher'
import { ThemeToggleRow } from './ThemeToggleRow'

const OAUTH_RETRY_DELAY_MS = 2_000

function resolveActiveLanguageCode(languageCode?: string): string {
  if (!languageCode) return languages[0].code
  if (languages.some(lang => lang.code === languageCode)) return languageCode
  const baseLanguageCode = languageCode.split('-')[0]
  return languages.find(lang => lang.code === baseLanguageCode)?.code || languages[0].code
}

// ─── Shared types ────────────────────────────────────────────────────────────

interface ContributorLevelInfo {
  name: string
  bgClass: string
  textClass: string
}

export interface OAuthStatus {
  checked: boolean
  configured: boolean
  backendUp: boolean
}

// ─── useOAuthStatus ───────────────────────────────────────────────────────────
// Encapsulates the two OAuth-check effects that were previously in ProfileCard.

// eslint-disable-next-line react-refresh/only-export-components
export function useOAuthStatus(isOpen: boolean): OAuthStatus {
  const [oauthStatus, setOauthStatus] = useState<OAuthStatus>({
    checked: false,
    configured: false,
    backendUp: false,
  })

  useEffect(() => {
    let cancelled = false
    const doCheck = () => {
      checkOAuthConfigured().then(({ backendUp, oauthConfigured }) => {
        if (cancelled) return
        if (backendUp) {
          setOauthStatus({ checked: true, configured: oauthConfigured, backendUp: true })
        } else {
          setTimeout(doCheck, OAUTH_RETRY_DELAY_MS)
        }
      }).catch(() => { })
    }
    doCheck()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!isOpen) return
    checkOAuthConfigured().then(({ backendUp, oauthConfigured }) => {
      if (backendUp) {
        setOauthStatus({ checked: true, configured: oauthConfigured, backendUp: true })
      }
    }).catch(() => { })
  }, [isOpen])

  return oauthStatus
}

// ─── ProfileAvatarBlock ───────────────────────────────────────────────────────

interface ProfileAvatarBlockProps {
  user: {
    github_login?: string
    email?: string
    avatar_url?: string
  }
}

export function ProfileAvatarBlock({ user }: ProfileAvatarBlockProps) {
  const { t } = useTranslation()
  return (
    <div className="p-4 bg-secondary border-b border-border">
      <div className="flex items-center gap-3">
        {user.avatar_url ? (
          <img
            src={user.avatar_url}
            alt={user?.github_login || 'User avatar'}
            className="w-12 h-12 rounded-full"
            loading="lazy"
            width={48}
            height={48}
          />
        ) : (
          <div className="w-12 h-12 rounded-full bg-purple-900 flex items-center justify-center">
            <User className="w-6 h-6 text-purple-400" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="font-medium text-foreground truncate">{user.github_login}</p>
          <Tooltip content={user.email || t('profile.noEmail')}>
            <p className="text-sm text-muted-foreground overflow-hidden text-ellipsis whitespace-nowrap">
              {user.email || t('profile.noEmail')}
            </p>
          </Tooltip>
        </div>
      </div>
    </div>
  )
}

// ─── ProfileStatRows ──────────────────────────────────────────────────────────

interface ProfileStatRowsProps {
  user: { slack_id?: string }
  totalCoins: number
  localCoins: number
  githubPoints: number
  bonusPoints: number
  contributorLevel: ContributorLevelInfo
  isOpen: boolean
  closeDropdown: () => void
  onShowRewards: () => void
}

export function ProfileStatRows({
  user,
  totalCoins,
  localCoins,
  githubPoints,
  bonusPoints,
  contributorLevel,
  isOpen,
  closeDropdown,
  onShowRewards,
}: ProfileStatRowsProps) {
  const { t, i18n } = useTranslation()

  const activeLanguageCode = resolveActiveLanguageCode(i18n.resolvedLanguage || i18n.language)
  const currentLanguage = languages.find(language => language.code === activeLanguageCode) || languages[0]

  const handleLanguageChange = async (langCode: string) => {
    await i18n.changeLanguage(langCode)
    safeSetItem(LANGUAGE_STORAGE_KEY, langCode)
    emitLanguageChanged(langCode)
    closeDropdown()
  }

  return (
    <div className="p-3 space-y-2 border-b border-border">
      <div className="flex items-center gap-3 px-2 py-1.5 text-sm min-w-0">
        <MessageSquare className="w-4 h-4 text-muted-foreground shrink-0" />
        <span className="text-muted-foreground shrink-0">{t('profile.slack')}</span>
        <span className="text-foreground truncate">{user.slack_id || t('profile.notConnected')}</span>
      </div>
      <div className="flex items-center gap-3 px-2 py-1.5 text-sm">
        <Shield className="w-4 h-4 text-muted-foreground" />
        <span className="text-muted-foreground">{t('profile.role')}</span>
        <span className={`text-xs px-2 py-0.5 rounded-full ${contributorLevel.bgClass} ${contributorLevel.textClass}`}>
          {contributorLevel.name}
        </span>
      </div>
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          closeDropdown()
          onShowRewards()
        }}
        className="w-full flex items-center gap-3 px-2 py-1.5 text-sm hover:bg-secondary rounded-lg transition-colors"
      >
        <Coins className="w-4 h-4 text-yellow-500" />
        <span className="text-muted-foreground">{t('profile.coins')}</span>
        <span
          className="ml-auto text-yellow-400 font-medium"
          title={[
            `Console activity: ${localCoins.toLocaleString()}`,
            githubPoints > 0 ? `GitHub contributions: ${githubPoints.toLocaleString()}` : null,
            bonusPoints > 0 ? `Bonus: ${bonusPoints.toLocaleString()}` : null,
            'Note: Docs leaderboard shows GitHub points only',
          ].filter(Boolean).join('\n')}
        >{totalCoins.toLocaleString()}</span>
        <ChevronDown className="w-3 h-3 text-muted-foreground -rotate-90" />
      </button>

      <OrgSwitcher
        activeLanguageCode={activeLanguageCode}
        currentLanguage={currentLanguage}
        onLanguageChange={handleLanguageChange}
        isOpen={isOpen}
        languageLabel={t('profile.language')}
      />
    </div>
  )
}

// ─── ProfileDevPanel ──────────────────────────────────────────────────────────

interface ProfileDevPanelProps {
  oauthStatus: OAuthStatus
  closeDropdown: () => void
  onShowSetupDialog: () => void
  onShowDevSetupDialog: () => void
}

export function ProfileDevPanel({
  oauthStatus,
  closeDropdown,
  onShowSetupDialog,
  onShowDevSetupDialog,
}: ProfileDevPanelProps) {
  const { t } = useTranslation()
  const [showDevPanel, setShowDevPanel] = useState(false)
  const { channel, installMethod } = useVersionCheck()

  return (
    <div className="border-b border-border">
      <button
        type="button"
        onClick={() => setShowDevPanel(!showDevPanel)}
        className="w-full flex items-center gap-3 px-5 py-2 text-sm hover:bg-secondary transition-colors"
      >
        <Code2 className="w-4 h-4 text-blue-400" />
        <span className="text-foreground">{t('developer.title')}</span>
        <ChevronDown className={`w-3 h-3 ml-auto text-muted-foreground transition-transform ${showDevPanel ? 'rotate-180' : ''}`} />
      </button>
      {showDevPanel && (
        <div className="px-5 pb-3 space-y-2">
          <div className="flex items-center gap-2 text-xs">
            <span className={`px-1.5 py-0.5 rounded text-2xs uppercase font-bold ${__DEV_MODE__ ? 'bg-yellow-900 text-yellow-400' : 'bg-green-900 text-green-400'}`}>
              {__DEV_MODE__ ? 'dev' : 'prod'}
            </span>
            <span className="text-muted-foreground font-mono">
              {__APP_VERSION__.startsWith('v') ? __APP_VERSION__ : `v${__APP_VERSION__}`} · {__COMMIT_HASH__.substring(0, 7)}
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs">
            {oauthStatus.checked ? (
              oauthStatus.configured ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                  <span className="text-green-400">{t('developer.oauthConfigured')}</span>
                </>
              ) : (
                <>
                  <XCircle className="w-3.5 h-3.5 text-yellow-400" />
                  <span className="text-yellow-400">{t('developer.oauthNotConfigured')}</span>
                </>
              )
            ) : (
              <span className="text-muted-foreground">{t('developer.checkingOauth')}</span>
            )}
          </div>

          {installMethod === 'dev' && channel === 'developer' && (
            <div className="flex items-center gap-2 text-xs">
              <GitBranch className="w-3.5 h-3.5 text-orange-400" />
              <span className="text-orange-400">
                {t('settings.updates.developer')}
              </span>
            </div>
          )}

          <div className="flex flex-col gap-1 pt-1">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                closeDropdown()
                if (installMethod === 'dev') {
                  onShowDevSetupDialog()
                } else {
                  onShowSetupDialog()
                }
              }}
              className="flex items-center gap-2 text-xs text-purple-400 hover:text-purple-300 transition-colors"
            >
              <Rocket className="w-3.5 h-3.5" />
              {installMethod === 'dev' ? t('developer.devModeSetup') : t('developer.setupInstructions')}
            </button>
            {!oauthStatus.configured && oauthStatus.checked && (
              <a
                href="https://github.com/settings/developers"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-xs text-purple-400 hover:text-purple-300 transition-colors"
              >
                <KeyRound className="w-3.5 h-3.5" />
                {t('developer.configureOauth')}
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
            <a
              href="https://github.com/kubestellar/console"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              {t('developer.githubRepo')}
            </a>
            <a
              href="https://console-docs.kubestellar.io"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              {t('developer.docs')}
            </a>
          </div>
        </div>
      )}
    </div>
  )
}

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
