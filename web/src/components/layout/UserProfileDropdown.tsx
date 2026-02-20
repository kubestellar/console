import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { User, Mail, MessageSquare, Shield, Settings, LogOut, ChevronDown, Coins, Lightbulb, Linkedin, Globe, Check, Download, Code2, ExternalLink, Rocket, KeyRound, CheckCircle2, XCircle, GitBranch } from 'lucide-react'
import { useRewards, REWARD_ACTIONS } from '../../hooks/useRewards'
import { getContributorLevel } from '../../types/rewards'
import { useVersionCheck } from '../../hooks/useVersionCheck'
import { languages } from '../../lib/i18n'
import { isDemoModeForced } from '../../lib/demoMode'
import { checkOAuthConfigured } from '../../lib/api'
import { SetupInstructionsDialog } from '../setup/SetupInstructionsDialog'
import { FeatureRequestModal } from '../feedback/FeatureRequestModal'

interface UserProfileDropdownProps {
  user: {
    github_login?: string
    email?: string
    avatar_url?: string
    role?: string
    slackId?: string
  } | null
  onLogout: () => void
  onPreferences?: () => void
}

export function UserProfileDropdown({ user, onLogout, onPreferences }: UserProfileDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [showLanguageSubmenu, setShowLanguageSubmenu] = useState(false)
  const [showSetupDialog, setShowSetupDialog] = useState(false)
  const [showRewards, setShowRewards] = useState(false)
  const [showFeedbackModal, setShowFeedbackModal] = useState(false)
  const [showDevPanel, setShowDevPanel] = useState(false)
  // If user is logged in via GitHub, OAuth is obviously configured
  const [oauthStatus, setOauthStatus] = useState<{ checked: boolean; configured: boolean; backendUp: boolean }>({
    checked: !!user?.github_login,
    configured: !!user?.github_login,
    backendUp: !!user?.github_login,
  })
  const dropdownRef = useRef<HTMLDivElement>(null)
  const { totalCoins, awardCoins } = useRewards()
  const { channel, setChannel, installMethod } = useVersionCheck()
  const { t, i18n } = useTranslation()

  const currentLanguage = languages.find(l => l.code === i18n.language) || languages[0]

  const handleLanguageChange = (langCode: string) => {
    i18n.changeLanguage(langCode)
    setShowLanguageSubmenu(false)
  }

  const handleLinkedInShare = () => {
    const linkedInUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent('https://kubestellar.io')}`
    window.open(linkedInUrl, '_blank', 'width=600,height=600')
    awardCoins('linkedin_share')
    setIsOpen(false)
  }

  // Re-check OAuth status each time dev panel is opened
  useEffect(() => {
    if (showDevPanel) {
      checkOAuthConfigured().then(({ backendUp, oauthConfigured }) => {
        setOauthStatus({ checked: true, configured: oauthConfigured, backendUp })
      })
    }
  }, [showDevPanel])

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Close dropdown on escape
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown)
      return () => document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  if (!user) return null

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-3 pl-3 border-l border-border hover:bg-secondary/50 rounded-lg p-2 transition-colors"
      >
        {user.avatar_url ? (
          <img
            src={user.avatar_url}
            alt={user.github_login}
            className="w-8 h-8 rounded-full"
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center">
            <User className="w-4 h-4 text-purple-400" />
          </div>
        )}
        <div className="hidden sm:block text-left">
          <p className="text-sm font-medium text-foreground">{user.github_login}</p>
        </div>
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-72 bg-card border border-border rounded-xl shadow-2xl overflow-hidden z-50">
          {/* Header with avatar and name */}
          <div className="p-4 bg-secondary/30 border-b border-border">
            <div className="flex items-center gap-3">
              {user.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt={user.github_login}
                  className="w-12 h-12 rounded-full"
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-purple-500/20 flex items-center justify-center">
                  <User className="w-6 h-6 text-purple-400" />
                </div>
              )}
              <div>
                <p className="font-medium text-foreground">{user.github_login}</p>
                <p className="text-sm text-muted-foreground">{user.email || t('profile.noEmail')}</p>
              </div>
            </div>
          </div>

          {/* User details section */}
          <div className="p-3 space-y-2 border-b border-border">
            <div className="flex items-center gap-3 px-2 py-1.5 text-sm">
              <Mail className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground">{t('profile.email')}</span>
              <span className="text-foreground truncate">{user.email || t('profile.notSet')}</span>
            </div>
            <div className="flex items-center gap-3 px-2 py-1.5 text-sm">
              <MessageSquare className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground">{t('profile.slack')}</span>
              <span className="text-foreground">{user.slackId || t('profile.notConnected')}</span>
            </div>
            <div className="flex items-center gap-3 px-2 py-1.5 text-sm">
              <Shield className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground">{t('profile.role')}</span>
              <span className={`text-xs px-2 py-0.5 rounded ${
                user.role === 'admin' ? 'bg-purple-500/20 text-purple-400' : 'bg-secondary text-foreground'
              }`}>
                {user.role || t('profile.defaultRole')}
              </span>
            </div>
            <button
              onClick={() => {
                setIsOpen(false)
                setShowRewards(true)
              }}
              className="w-full flex items-center gap-3 px-2 py-1.5 text-sm hover:bg-secondary/50 rounded-lg transition-colors"
            >
              <Coins className="w-4 h-4 text-yellow-500" />
              <span className="text-muted-foreground">{t('profile.coins')}</span>
              <span className="text-yellow-400 font-medium">{totalCoins.toLocaleString()}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${getContributorLevel(totalCoins).current.bgClass} ${getContributorLevel(totalCoins).current.textClass}`}>
                {getContributorLevel(totalCoins).current.name}
              </span>
              <ChevronDown className="w-3 h-3 ml-auto text-muted-foreground -rotate-90" />
            </button>
            {/* Language selector */}
            <div className="relative">
              <button
                onClick={() => setShowLanguageSubmenu(!showLanguageSubmenu)}
                className="w-full flex items-center gap-3 px-2 py-1.5 text-sm hover:bg-secondary/50 rounded-lg transition-colors"
              >
                <Globe className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">{t('profile.language')}</span>
                <span className="text-foreground flex items-center gap-1.5">
                  <span>{currentLanguage.flag}</span>
                  <span>{currentLanguage.name}</span>
                </span>
                <ChevronDown className={`w-3 h-3 ml-auto text-muted-foreground transition-transform ${showLanguageSubmenu ? 'rotate-180' : ''}`} />
              </button>
              {showLanguageSubmenu && (
                <div className="mt-1 ml-6 space-y-0.5 border-l-2 border-border pl-3">
                  {languages.map((lang) => (
                    <button
                      key={lang.code}
                      onClick={() => handleLanguageChange(lang.code)}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-lg transition-colors ${
                        i18n.language === lang.code
                          ? 'bg-purple-500/20 text-foreground'
                          : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
                      }`}
                    >
                      <span>{lang.flag}</span>
                      <span>{lang.name}</span>
                      {i18n.language === lang.code && (
                        <Check className="w-3 h-3 ml-auto text-purple-400" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Developer panel — only on local/cluster installs */}
          {!isDemoModeForced && (
            <div className="border-b border-border">
              <button
                onClick={() => setShowDevPanel(!showDevPanel)}
                className="w-full flex items-center gap-3 px-5 py-2 text-sm hover:bg-secondary/50 transition-colors"
              >
                <Code2 className="w-4 h-4 text-blue-400" />
                <span className="text-foreground">{t('developer.title')}</span>
                <ChevronDown className={`w-3 h-3 ml-auto text-muted-foreground transition-transform ${showDevPanel ? 'rotate-180' : ''}`} />
              </button>
              {showDevPanel && (
                <div className="px-5 pb-3 space-y-2">
                  {/* Version info */}
                  <div className="flex items-center gap-2 text-xs">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold ${__DEV_MODE__ ? 'bg-yellow-500/20 text-yellow-400' : 'bg-green-500/20 text-green-400'}`}>
                      {__DEV_MODE__ ? 'dev' : 'prod'}
                    </span>
                    <span className="text-muted-foreground font-mono">
                      {__APP_VERSION__.startsWith('v') ? __APP_VERSION__ : `v${__APP_VERSION__}`} · {__COMMIT_HASH__.substring(0, 7)}
                    </span>
                  </div>

                  {/* OAuth status */}
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

                  {/* Developer update channel toggle */}
                  {installMethod === 'dev' && (
                    <button
                      onClick={() => {
                        setChannel(channel === 'developer' ? 'stable' : 'developer')
                      }}
                      className="flex items-center gap-2 text-xs"
                    >
                      <GitBranch className={`w-3.5 h-3.5 ${channel === 'developer' ? 'text-orange-400' : 'text-muted-foreground'}`} />
                      <span className={channel === 'developer' ? 'text-orange-400' : 'text-muted-foreground'}>
                        {t('settings.updates.developer')}
                      </span>
                      <div
                        className={`ml-auto relative w-8 h-4 rounded-full transition-colors ${
                          channel === 'developer' ? 'bg-orange-500' : 'bg-secondary'
                        }`}
                      >
                        <div
                          className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow-sm transition-transform ${
                            channel === 'developer' ? 'translate-x-4' : 'translate-x-0.5'
                          }`}
                        />
                      </div>
                    </button>
                  )}

                  {/* Action buttons */}
                  <div className="flex flex-col gap-1 pt-1">
                    <button
                      onClick={() => {
                        setIsOpen(false)
                        setShowSetupDialog(true)
                      }}
                      className="flex items-center gap-2 text-xs text-purple-400 hover:text-purple-300 transition-colors"
                    >
                      <Rocket className="w-3.5 h-3.5" />
                      {t('developer.setupInstructions')}
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

          {/* Actions */}
          <div className="p-2">
            <button
              onClick={() => {
                setIsOpen(false)
                setShowFeedbackModal(true)
              }}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm text-foreground hover:bg-secondary rounded-lg transition-colors"
            >
              <Lightbulb className="w-4 h-4 text-yellow-500" />
              <span>{t('feedback.feedback')}</span>
              <span className="ml-auto text-xs px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400">{t('feedback.plusCoins')}</span>
            </button>
            <button
              onClick={handleLinkedInShare}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm text-foreground hover:bg-secondary rounded-lg transition-colors"
            >
              <Linkedin className="w-4 h-4 text-[#0A66C2]" />
              <span>{t('feedback.shareOnLinkedIn')}</span>
              <span className="ml-auto text-xs px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400">+{REWARD_ACTIONS.linkedin_share.coins}</span>
            </button>
            <button
              onClick={() => {
                setIsOpen(false)
                onPreferences?.()
              }}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm text-foreground hover:bg-secondary rounded-lg transition-colors"
            >
              <Settings className="w-4 h-4 text-muted-foreground" />
              {t('settings.title')}
            </button>
            <button
              onClick={() => {
                setIsOpen(false)
                if (isDemoModeForced) {
                  setShowSetupDialog(true)
                } else {
                  onLogout()
                }
              }}
              className={`w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-colors ${
                isDemoModeForced
                  ? 'text-purple-400 hover:bg-purple-500/10'
                  : 'text-red-400 hover:bg-red-500/10'
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

      {/* Setup instructions dialog — shown when demo users click sign out */}
      <SetupInstructionsDialog
        isOpen={showSetupDialog}
        onClose={() => setShowSetupDialog(false)}
      />

      {/* Rewards panel — opens feedback dialog to GitHub contributions tab */}
      <FeatureRequestModal
        isOpen={showRewards}
        onClose={() => setShowRewards(false)}
        initialTab="updates"
      />

      {/* Feedback modal — same as top navbar/card bug button */}
      <FeatureRequestModal
        isOpen={showFeedbackModal}
        onClose={() => setShowFeedbackModal(false)}
        initialTab="submit"
      />
    </div>
  )
}
