import { useState, useEffect, useRef, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Save, User, Loader2, AlertCircle, RefreshCw, Check, Copy, Share2 } from 'lucide-react'
import { STORAGE_KEY_TOKEN, FETCH_DEFAULT_TIMEOUT_MS } from '../../../lib/constants'
import { UI_FEEDBACK_TIMEOUT_MS } from '../../../lib/constants/network'
import { safeGetItem } from '../../../lib/utils/localStorage'

interface ProfileSectionProps {
  initialEmail: string
  initialSlackId: string
  /** GitHub login used to populate the affiliate link. Empty = section hidden / disabled. */
  githubLogin?: string
  refreshUser: () => Promise<void>
  isLoading?: boolean
}

/** Channels shown in the affiliate-link medium picker. Values mirror GA4
 *  utm_medium conventions so attribution stays consistent with the existing
 *  intern_outreach tracking. */
const AFFILIATE_CHANNELS = [
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'twitter',  label: 'Twitter / X' },
  { value: 'email',    label: 'Email' },
  { value: 'sms',      label: 'SMS / text' },
  { value: 'blog',     label: 'Blog' },
  { value: 'youtube',  label: 'YouTube' },
  { value: 'devto',    label: 'dev.to' },
  { value: 'github',   label: 'GitHub (comment/README)' },
  { value: 'other',    label: 'Other' },
] as const

/** Base URL users will share. The leaderboard's backend (affiliate-clicks
 *  Netlify function) listens on console.kubestellar.io only, so that's the
 *  canonical destination regardless of where the user is viewing this UI. */
const AFFILIATE_BASE_URL = 'https://console.kubestellar.io'
/** utm_source is fixed: these are personal shares by a contributor. */
const AFFILIATE_UTM_SOURCE = 'social'
/** utm_campaign for GitHub-identity shares (the new, forward-going scheme). */
const AFFILIATE_UTM_CAMPAIGN = 'contributor_affiliate'
/** How long to flash the "Copied!" label after a successful copy. */
const AFFILIATE_COPY_FLASH_MS = 1500

// Basic email format check: non-empty local + "@" + domain + "." + TLD, no whitespace.
// Intentionally not RFC-perfect — matches HTML5 type=email's spirit and blocks obvious junk.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function ProfileSection({ initialEmail, initialSlackId, githubLogin, refreshUser, isLoading }: ProfileSectionProps) {
  const { t } = useTranslation()
  const [email, setEmail] = useState(initialEmail)
  const [slackId, setSlackId] = useState(initialSlackId)
  const [profileSaved, setProfileSaved] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [affiliateChannel, setAffiliateChannel] = useState<string>(AFFILIATE_CHANNELS[0].value)
  const [affiliateCopied, setAffiliateCopied] = useState(false)
  const timeoutRef = useRef<number>(undefined)
  const copyTimeoutRef = useRef<number>(undefined)

  // Canonical affiliate URL for the current user. Lowercased login to match
  // the affiliate-clicks Netlify function's lookup key and the leaderboard's
  // case-insensitive rendering. utm_term goes last so the string is readable
  // when displayed in the textarea.
  const affiliateUrl = useMemo(() => {
    if (!githubLogin) return ''
    const term = githubLogin.toLowerCase()
    const params = new URLSearchParams({
      utm_source: AFFILIATE_UTM_SOURCE,
      utm_medium: affiliateChannel,
      utm_campaign: AFFILIATE_UTM_CAMPAIGN,
      utm_term: term,
    })
    return `${AFFILIATE_BASE_URL}/?${params.toString()}`
  }, [githubLogin, affiliateChannel])

  const handleCopyAffiliate = async () => {
    if (!affiliateUrl) return
    try {
      await navigator.clipboard.writeText(affiliateUrl)
      setAffiliateCopied(true)
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current)
      copyTimeoutRef.current = window.setTimeout(() => setAffiliateCopied(false), AFFILIATE_COPY_FLASH_MS)
    } catch {
      // Clipboard API can reject on non-secure contexts or denied permission.
      // The URL is already visible in the input, so users can copy manually.
    }
  }

  const handleEmailChange = (value: string) => {
    setEmail(value)
    const trimmed = value.trim()
    if (trimmed.length > 0 && !EMAIL_REGEX.test(trimmed)) {
      setEmailError(t('settings.profile.invalidEmail'))
    } else {
      setEmailError(null)
    }
  }

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current)
      }
    }
  }, [])

  const handleSaveProfile = async () => {
    const trimmedEmail = email.trim()
    if (!EMAIL_REGEX.test(trimmedEmail)) {
      setEmailError(t('settings.profile.invalidEmail'))
      return
    }
    setIsSaving(true)
    setError(null)
    try {
      const token = safeGetItem(STORAGE_KEY_TOKEN)
      const response = await fetch('/api/me', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ email, slack_id: slackId }),
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
      })
      if (!response.ok) {
        throw new Error(t('settings.profile.saveFailed'))
      }
      // Refresh user data to update the dropdown
      setIsRefreshing(true)
      await refreshUser()
      setIsRefreshing(false)
      setProfileSaved(true)
      timeoutRef.current = window.setTimeout(() => setProfileSaved(false), UI_FEEDBACK_TIMEOUT_MS)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t('settings.profile.saveFailed')
      setError(message)
      setIsRefreshing(false)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div id="profile-settings" className="glass rounded-xl p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-lg bg-secondary">
          <User className="w-5 h-5 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-lg font-medium text-foreground">{t('settings.profile.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('settings.profile.subtitle')}</p>
        </div>
      </div>
      {isLoading ? (
        <div className="space-y-4 animate-pulse">
          <div>
            <div className="h-4 bg-secondary rounded w-12 mb-1"></div>
            <div className="h-9 bg-secondary rounded"></div>
          </div>
          <div>
            <div className="h-4 bg-secondary rounded w-16 mb-1"></div>
            <div className="h-9 bg-secondary rounded"></div>
          </div>
          <div className="h-9 bg-secondary rounded w-32"></div>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label htmlFor="profile-email" className="block text-sm text-muted-foreground mb-1">{t('settings.profile.email')}</label>
            <input
              id="profile-email"
              type="email"
              value={email}
              onChange={(e) => handleEmailChange(e.target.value)}
              aria-invalid={!!emailError}
              aria-describedby={emailError ? 'profile-email-error' : undefined}
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground text-sm"
            />
            {emailError && (
              <p id="profile-email-error" className="mt-1 text-xs text-red-400">{emailError}</p>
            )}
          </div>
          <div>
            <label htmlFor="profile-slack" className="block text-sm text-muted-foreground mb-1">{t('settings.profile.slackId')}</label>
            <input
              id="profile-slack"
              type="text"
              value={slackId}
              onChange={(e) => setSlackId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground text-sm"
            />
          </div>
          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="w-4 h-4" />
                <span>{error}</span>
              </div>
              <button
                onClick={handleSaveProfile}
                disabled={isSaving}
                className="flex items-center gap-2 px-3 py-1.5 rounded bg-red-500/20 hover:bg-red-500/30 text-red-400 text-xs transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${isSaving ? 'animate-spin' : ''}`} />
                {t('settings.profile.retrySave')}
              </button>
            </div>
          )}
          <button
            onClick={handleSaveProfile}
            disabled={isSaving || isRefreshing || !!emailError}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-500 text-white hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving || isRefreshing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {isRefreshing ? t('settings.profile.refreshing') : isSaving ? t('settings.profile.saving') : profileSaved ? t('settings.profile.saved') : t('settings.profile.saveProfile')}
          </button>

          {/* Affiliate link block — renders the canonical share URL for the
              contributor leaderboard's "Social" column. Requires a GitHub
              login; shows an explanatory placeholder otherwise. */}
          <div className="pt-6 mt-2 border-t border-border/50">
            <div className="flex items-center gap-2 mb-2">
              <Share2 className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-sm font-medium text-foreground">{t('settings.profile.affiliateTitle')}</h3>
            </div>
            <p className="text-xs text-muted-foreground mb-3">{t('settings.profile.affiliateSubtitle')}</p>

            {!githubLogin ? (
              <p className="text-xs text-muted-foreground italic">
                {t('settings.profile.affiliateLoginMissing')}
              </p>
            ) : (
              <>
                <div className="mb-3">
                  <label htmlFor="affiliate-channel" className="block text-xs text-muted-foreground mb-1">
                    {t('settings.profile.affiliateChannelLabel')}
                  </label>
                  <select
                    id="affiliate-channel"
                    value={affiliateChannel}
                    onChange={(e) => setAffiliateChannel(e.target.value)}
                    className="w-full sm:w-auto px-3 py-2 rounded-lg bg-secondary border border-border text-foreground text-sm"
                  >
                    {AFFILIATE_CHANNELS.map((ch) => (
                      <option key={ch.value} value={ch.value}>{ch.label}</option>
                    ))}
                  </select>
                  <p className="mt-1 text-[11px] text-muted-foreground">{t('settings.profile.affiliateChannelHint')}</p>
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    id="affiliate-url"
                    type="text"
                    value={affiliateUrl}
                    readOnly
                    onFocus={(e) => e.currentTarget.select()}
                    className="flex-1 px-3 py-2 rounded-lg bg-secondary border border-border text-foreground text-xs font-mono select-all"
                    aria-label={t('settings.profile.affiliateTitle')}
                  />
                  <button
                    type="button"
                    onClick={handleCopyAffiliate}
                    className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 border border-purple-500/30 text-sm whitespace-nowrap transition-colors"
                  >
                    {affiliateCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {affiliateCopied ? t('settings.profile.affiliateCopied') : t('settings.profile.affiliateCopy')}
                  </button>
                </div>

                <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                  {t('settings.profile.affiliateFootnote')}
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
