import { useState, useEffect, Suspense, type KeyboardEvent, type RefObject } from 'react'
import { safeLazy } from '../../lib/safeLazy'
import { Tooltip } from '../ui/Tooltip'
import { useModalState } from '../../lib/modals'
import { useTranslation } from 'react-i18next'
import { User, MessageSquare, Shield, LogOut, ChevronDown, Coins, Lightbulb, Download, Code2, ExternalLink, Rocket, KeyRound, CheckCircle2, XCircle, GitBranch } from 'lucide-react'
import { Linkedin } from '@/lib/icons'
import { useRewards, REWARD_ACTIONS } from '../../hooks/useRewards'
import { getContributorLevel } from '../../types/rewards'
import { useVersionCheck } from '../../hooks/useVersionCheck'
import { LANGUAGE_STORAGE_KEY, languages } from '../../lib/i18n'
import { isDemoModeForced } from '../../lib/demoMode'
import { emitLinkedInShare, emitLanguageChanged } from '../../lib/analytics'
import { checkOAuthConfigured } from '../../lib/api'
import { safeSetItem } from '../../lib/utils/localStorage'
import { SetupInstructionsDialog } from '../setup/SetupInstructionsDialog'
import { DeveloperSetupDialog } from '../setup/DeveloperSetupDialog'
import { ConfirmDialog } from '../../lib/modals/ConfirmDialog'
import { OrgSwitcher } from './OrgSwitcher'
import { ThemeToggleRow } from './ThemeToggleRow'

const FeatureRequestModal = safeLazy(() => import('../feedback/FeatureRequestModal'), 'FeatureRequestModal')

interface ProfileCardProps {
  user: {
    github_login?: string
    email?: string
    avatar_url?: string
    role?: string
    slack_id?: string
  }
  isOpen: boolean
  closeDropdown: () => void
  onPreferences?: () => void
  onLogout: () => void
  menuRef: RefObject<HTMLDivElement | null>
  onMenuKeyDown: (event: KeyboardEvent<HTMLElement>) => void
  triggerButtonRef: RefObject<HTMLButtonElement | null>
}

function resolveActiveLanguageCode(languageCode?: string): string {
  if (!languageCode) return languages[0].code
  if (languages.some(lang => lang.code === languageCode)) return languageCode

  const baseLanguageCode = languageCode.split('-')[0]
  return languages.find(lang => lang.code === baseLanguageCode)?.code || languages[0].code
}

export function ProfileCard({
  user,
  isOpen,
  closeDropdown,
  onPreferences,
  onLogout,
  menuRef,
  onMenuKeyDown,
  triggerButtonRef,
}: ProfileCardProps) {
  const [showSetupDialog, setShowSetupDialog] = useState(false)
  const [showDevSetupDialog, setShowDevSetupDialog] = useState(false)
  const [showRewards, setShowRewards] = useState(false)
  const { isOpen: showFeedbackModal, open: openFeedbackModal, close: closeFeedbackModal } = useModalState()
  const [showDevPanel, setShowDevPanel] = useState(false)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [oauthStatus, setOauthStatus] = useState<{ checked: boolean; configured: boolean; backendUp: boolean }>({
    checked: false,
    configured: false,
    backendUp: false,
  })
  const { totalCoins, githubPoints, localCoins, bonusPoints, awardCoins } = useRewards()
  const { channel, installMethod } = useVersionCheck()
  const { t, i18n } = useTranslation()

  const activeLanguageCode = resolveActiveLanguageCode(i18n.resolvedLanguage || i18n.language)
  const currentLanguage = languages.find(language => language.code === activeLanguageCode) || languages[0]
  const contributorLevel = getContributorLevel(totalCoins).current

  const handleLanguageChange = async (langCode: string) => {
    await i18n.changeLanguage(langCode)
    safeSetItem(LANGUAGE_STORAGE_KEY, langCode)
    emitLanguageChanged(langCode)
    closeDropdown()
  }

  const handleLinkedInShare = () => {
    const linkedInUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent('https://kubestellar.io')}`
    window.open(linkedInUrl, '_blank', 'noopener,noreferrer,width=600,height=600')
    emitLinkedInShare('profile_dropdown')
    awardCoins('linkedin_share')
    closeDropdown()
  }

  useEffect(() => {
    let cancelled = false
    const OAUTH_RETRY_DELAY_MS = 2_000
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
    if (isOpen) {
      checkOAuthConfigured().then(({ backendUp, oauthConfigured }) => {
        if (backendUp) {
          setOauthStatus({ checked: true, configured: oauthConfigured, backendUp: true })
        }
      }).catch(() => { })
      return
    }

    setShowDevPanel(false)
  }, [isOpen])

  return (
    <>
      {isOpen && (
        <div
          ref={menuRef}
          id="profile-dropdown-menu"
          data-testid="navbar-profile-dropdown"
          role="menu"
          onKeyDown={(event) => {
            onMenuKeyDown(event)
            if (event.key === 'Escape') {
              triggerButtonRef.current?.focus()
            }
          }}
          className="absolute right-0 top-full mt-2 w-72 max-w-[calc(100vw-1rem)] max-h-[calc(100vh-5rem)] bg-card border border-border rounded-xl shadow-2xl overflow-hidden overflow-y-auto z-toast"
        >
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
                  <p className="text-sm text-muted-foreground overflow-hidden text-ellipsis whitespace-nowrap">{user.email || t('profile.noEmail')}</p>
                </Tooltip>
              </div>
            </div>
          </div>

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
                setShowRewards(true)
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

          {!isDemoModeForced && (
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
                          setShowDevSetupDialog(true)
                        } else {
                          setShowSetupDialog(true)
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
          )}

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
                  setShowSetupDialog(true)
                } else {
                  setShowLogoutConfirm(true)
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
        </div>
      )}

      <SetupInstructionsDialog
        isOpen={showSetupDialog}
        onClose={() => setShowSetupDialog(false)}
      />

      <DeveloperSetupDialog
        isOpen={showDevSetupDialog}
        onClose={() => setShowDevSetupDialog(false)}
      />

      {showRewards && (
        <Suspense fallback={null}>
          <FeatureRequestModal
            isOpen={showRewards}
            onClose={() => setShowRewards(false)}
            initialTab="updates"
          />
        </Suspense>
      )}

      {showFeedbackModal && (
        <Suspense fallback={null}>
          <FeatureRequestModal
            isOpen={showFeedbackModal}
            onClose={closeFeedbackModal}
            initialTab="submit"
          />
        </Suspense>
      )}

      <ConfirmDialog
        isOpen={showLogoutConfirm}
        onClose={() => setShowLogoutConfirm(false)}
        onConfirm={() => {
          setShowLogoutConfirm(false)
          onLogout()
        }}
        title={t('confirmDialog.logoutTitle')}
        message={t('confirmDialog.logoutMessage')}
        confirmLabel={t('actions.logout', 'Log Out')}
        variant="warning"
      />
    </>
  )
}
