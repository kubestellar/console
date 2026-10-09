import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { User, MessageSquare, Shield, ChevronDown, Coins } from 'lucide-react'
import { Tooltip } from '../ui/Tooltip'
import { checkOAuthConfigured } from '../../lib/api'
import { LANGUAGE_STORAGE_KEY, ensureLanguageLoaded, languages } from '../../lib/i18n'
import { emitLanguageChanged } from '../../lib/analytics'
import { safeSetItem } from '../../lib/utils/localStorage'
import { OrgSwitcher } from './OrgSwitcher'

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
    // Non-English bundles are lazy-loaded; fetch before switching so the UI
    // doesn't flash English/missing keys while the chunk downloads.
    await ensureLanguageLoaded(langCode)
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
