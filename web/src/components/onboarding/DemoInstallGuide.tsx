import { useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { X, Copy, Check, ExternalLink, Settings, Rocket, Key, Download, ChevronRight, Github, Server } from 'lucide-react'
import { useDemoMode, isDemoModeForced } from '../../hooks/useDemoMode'
import { cn } from '../../lib/cn'
import { useTranslation } from 'react-i18next'

const DISMISSED_KEY = 'kc-demo-install-dismissed'

function CopyCommand({ command }: { command: string }) {
  const { t } = useTranslation('common')
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(command)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }, [command])

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-2 w-full text-left font-mono text-[13px] bg-black/40 border border-gray-700/50 rounded-lg px-3 py-2 hover:border-purple-500/40 hover:bg-black/60 transition-colors group/copy"
      title={copied ? t('common.copied') : t('onboarding.clickToCopy')}
    >
      <span className="text-gray-500 select-none">$</span>
      <span className="flex-1 text-gray-200 truncate">{command}</span>
      {copied ? (
        <Check className="w-3.5 h-3.5 text-green-400 shrink-0" />
      ) : (
        <Copy className="w-3.5 h-3.5 text-gray-600 group-hover/copy:text-gray-300 shrink-0 transition-colors" />
      )}
    </button>
  )
}

function StepNumber({ n }: { n: number }) {
  return (
    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 text-white text-sm font-bold shrink-0 shadow-lg shadow-purple-500/20">
      {n}
    </div>
  )
}

export function InstallModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('common')
  const { toggleDemoMode } = useDemoMode()

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] p-4 overflow-y-auto"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="min-h-full flex items-center justify-center"
        onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      >
        <div
          className="glass w-full max-w-xl rounded-2xl overflow-hidden animate-fade-in-up"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="relative px-6 pt-6 pb-3">
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-white/10 transition-colors"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-blue-500 shadow-lg shadow-purple-500/20">
                <Rocket className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-foreground">{t('onboarding.installTitle')}</h2>
                <p className="text-sm text-muted-foreground">{t('onboarding.installSubtitle')}</p>
              </div>
            </div>
          </div>

          {/* Steps */}
          <div className="px-6 space-y-5 pb-2">

            {/* Step 1: Quick Start (binary) */}
            <div className="flex gap-3">
              <StepNumber n={1} />
              <div className="flex-1 min-w-0 pt-0.5">
                <div className="flex items-center gap-2 mb-1.5">
                  <Download className="w-4 h-4 text-purple-400" />
                  <h3 className="text-sm font-semibold text-foreground">{t('onboarding.step1Title')}</h3>
                </div>
                <CopyCommand command="curl -sSL https://raw.githubusercontent.com/kubestellar/console/main/start.sh | bash" />
                <p className="text-[11px] text-muted-foreground/70 mt-1.5">
                  {t('onboarding.step1Desc')}
                </p>
              </div>
            </div>

            {/* Step 2: Optional - GitHub OAuth */}
            <div className="flex gap-3">
              <div className="flex items-center justify-center w-8 h-8 rounded-full border-2 border-dashed border-gray-600 text-gray-500 text-sm font-bold shrink-0">
                2
              </div>
              <div className="flex-1 min-w-0 pt-0.5">
                <div className="flex items-center gap-2 mb-1.5">
                  <Github className="w-4 h-4 text-blue-400" />
                  <h3 className="text-sm font-semibold text-muted-foreground">{t('onboarding.step2Title')}</h3>
                </div>
                <p className="text-xs text-muted-foreground mb-2">
                  {t('onboarding.step2Desc1')}{' '}
                  <a
                    href="https://github.com/settings/developers"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 underline underline-offset-2"
                  >
                    {t('onboarding.githubDevSettings')}
                  </a>
                  {' '}&rarr; {t('onboarding.newOAuthApp')}:
                </p>
                <div className="text-xs space-y-1 bg-black/30 rounded-lg px-3 py-2 border border-gray-700/30">
                  <div className="flex gap-2">
                    <span className="text-muted-foreground/70 shrink-0 w-28">{t('onboarding.homepageUrl')}</span>
                    <span className="text-gray-300 font-mono">http://localhost:8080</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-muted-foreground/70 shrink-0 w-28">{t('onboarding.callbackUrl')}</span>
                    <span className="text-gray-300 font-mono">http://localhost:8080/auth/github/callback</span>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground/70 mt-1.5">
                  {t('onboarding.step2Desc2')}
                </p>
              </div>
            </div>

            {/* Step 3: Optional - Deploy to Kubernetes */}
            <div className="flex gap-3">
              <div className="flex items-center justify-center w-8 h-8 rounded-full border-2 border-dashed border-gray-600 text-gray-500 text-sm font-bold shrink-0">
                3
              </div>
              <div className="flex-1 min-w-0 pt-0.5">
                <div className="flex items-center gap-2 mb-1.5">
                  <Server className="w-4 h-4 text-green-400" />
                  <h3 className="text-sm font-semibold text-muted-foreground">{t('onboarding.step3Title')}</h3>
                </div>
                <CopyCommand command="curl -sSL https://raw.githubusercontent.com/kubestellar/console/main/deploy.sh | bash" />
                <p className="text-[11px] text-muted-foreground/70 mt-1.5">
                  {t('onboarding.step3Desc')}
                </p>
              </div>
            </div>

            {/* Step 4: Optional - AI keys */}
            <div className="flex gap-3">
              <div className="flex items-center justify-center w-8 h-8 rounded-full border-2 border-dashed border-gray-600 text-gray-500 text-sm font-bold shrink-0">
                4
              </div>
              <div className="flex-1 min-w-0 pt-0.5">
                <div className="flex items-center gap-2 mb-1.5">
                  <Key className="w-4 h-4 text-yellow-400" />
                  <h3 className="text-sm font-semibold text-muted-foreground">{t('onboarding.step4Title')}</h3>
                </div>
                <p className="text-xs text-muted-foreground mb-2">
                  {t('onboarding.step4Desc')}
                </p>
                <Link
                  to="/settings"
                  onClick={onClose}
                  className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-secondary/50 border border-border/50 hover:bg-secondary/80 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Settings className="w-3.5 h-3.5" />
                  {t('onboarding.openSettings')}
                  <ChevronRight className="w-3 h-3" />
                </Link>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-4 mt-3 border-t border-border/50">
            <a
              href="https://kubestellar.io/docs/console"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {t('onboarding.fullDocumentation')}
              <ExternalLink className="w-3 h-3" />
            </a>
            <div className="flex items-center gap-2">
              {!isDemoModeForced && (
                <button
                  onClick={() => { toggleDemoMode(); onClose() }}
                  className="text-xs px-3 py-1.5 rounded-lg bg-yellow-500/10 border border-yellow-500/20 hover:bg-yellow-500/20 text-yellow-400 transition-colors"
                >
                  {t('onboarding.exitDemo')}
                </button>
              )}
              <button
                onClick={onClose}
                className="text-xs px-4 py-1.5 rounded-lg bg-purple-500/20 border border-purple-500/30 hover:bg-purple-500/30 text-purple-300 font-medium transition-colors"
              >
                {t('onboarding.gotIt')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// Banner under the demo mode banner
export function DemoInstallBanner({ collapsed }: { collapsed: boolean }) {
  const { t } = useTranslation('common')
  const [dismissed, setDismissed] = useState(() => {
    return localStorage.getItem(DISMISSED_KEY) === 'true'
  })
  const [modalOpen, setModalOpen] = useState(false)

  const handleDismiss = useCallback(() => {
    setDismissed(true)
    localStorage.setItem(DISMISSED_KEY, 'true')
  }, [])

  if (dismissed) return null

  return (
    <>
      <div className={cn(
        "fixed top-[calc(4rem+36px)] right-0 z-40 transition-[left] duration-300",
        "bg-gradient-to-r from-purple-500/10 via-blue-500/10 to-purple-500/10 border-b border-purple-500/20",
        collapsed ? "left-20" : "left-64",
      )}>
        <div className="flex items-center justify-center gap-3 py-1.5 px-4">
          <Rocket className="w-4 h-4 text-purple-400 animate-pulse" />
          <span className="text-sm text-purple-300">
            {t('onboarding.bannerMessage')}
          </span>
          <button
            onClick={() => setModalOpen(true)}
            className="text-xs px-3 py-1 rounded-full bg-purple-500/20 border border-purple-500/30 hover:bg-purple-500/30 text-purple-300 font-medium transition-colors"
          >
            {t('onboarding.installGuide')}
            <ChevronRight className="w-3 h-3 inline ml-0.5 -mr-0.5" />
          </button>
          <button
            onClick={handleDismiss}
            className="ml-1 p-1 hover:bg-purple-500/20 rounded transition-colors"
            title={t('actions.close')}
          >
            <X className="w-3.5 h-3.5 text-purple-400/70" />
          </button>
        </div>
      </div>

      {modalOpen && <InstallModal onClose={() => setModalOpen(false)} />}
    </>
  )
}

// Legacy export — no longer used in Layout
export function DemoInstallGuide() {
  return null
}
