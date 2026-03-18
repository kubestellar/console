import { useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Terminal, Globe, Rocket, X, ExternalLink, Copy, Check } from 'lucide-react'
import { cn } from '../../lib/cn'
import { copyToClipboard } from '../../lib/clipboard'
import { safeGetItem, safeSetItem } from '../../lib/utils/localStorage'

const DISMISSED_KEY = 'kc-welcome-dismissed'

/** The canonical quick-start install command */
const INSTALL_COMMAND = 'curl -sL https://raw.githubusercontent.com/kubestellar/console/main/start.sh | bash'

/** How long the "Copied!" confirmation shows (ms) */
const COPY_FEEDBACK_MS = 2000

export function WelcomeCard() {
  const { t } = useTranslation()
  const [dismissed, setDismissed] = useState(() => safeGetItem(DISMISSED_KEY) === 'true')
  const [copied, setCopied] = useState(false)
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  if (dismissed) return null

  const handleDismiss = () => {
    setDismissed(true)
    safeSetItem(DISMISSED_KEY, 'true')
  }

  const handleCopy = async () => {
    try {
      await copyToClipboard(INSTALL_COMMAND)
      setCopied(true)
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
      copyTimerRef.current = setTimeout(() => setCopied(false), COPY_FEEDBACK_MS)
    } catch {
      // Clipboard API not available
    }
  }

  return (
    <div className="mb-4 rounded-xl border border-purple-500/30 bg-gradient-to-br from-purple-500/5 via-blue-500/5 to-transparent p-5 relative">
      <button
        onClick={handleDismiss}
        className="absolute top-3 right-3 p-1 rounded-lg hover:bg-gray-500/10 dark:hover:bg-white/10 transition-colors text-muted-foreground hover:text-foreground"
        title={t('dashboard.welcome.dismiss')}
      >
        <X className="w-4 h-4" />
      </button>

      {/* Hero banner */}
      <div className="flex items-center gap-3 mb-3">
        <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-blue-500 shadow-lg shadow-purple-500/20">
          <Rocket className="w-6 h-6 text-white" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-foreground">{t('dashboard.welcome.gettingStarted')}</h3>
          <p className="text-sm text-muted-foreground">{t('dashboard.welcome.subtitle')}</p>
        </div>
      </div>

      <div className="space-y-3">
        <Step
          number={1}
          icon={Terminal}
          title={t('dashboard.welcome.step1Title')}
          description={t('dashboard.welcome.step1Desc')}
          action={
            <div className="flex items-center gap-2 mt-1">
              <code className="flex-1 px-3 py-2 text-xs font-mono bg-secondary/50 rounded-lg border border-border/50 text-foreground overflow-x-auto whitespace-nowrap">
                {INSTALL_COMMAND}
              </code>
              <button
                onClick={handleCopy}
                className={`p-2 rounded-lg border transition-all flex-shrink-0 ${
                  copied
                    ? 'bg-green-500/20 border-green-500/30 text-green-400'
                    : 'bg-secondary/50 border-border/50 hover:border-purple-500/30 text-muted-foreground hover:text-foreground'
                }`}
                title={copied ? 'Copied!' : 'Copy install command'}
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          }
        />
        <Step
          number={2}
          icon={Globe}
          title={t('dashboard.welcome.step2Title')}
          description={t('dashboard.welcome.step2Desc')}
        />
      </div>

      <div className="mt-4 pt-3 border-t border-border/30 flex items-center gap-4">
        <a
          href="https://console-docs.kubestellar.io"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ExternalLink className="w-3 h-3" />
          {t('dashboard.welcome.documentation')}
        </a>
      </div>
    </div>
  )
}

function Step({
  number,
  icon: Icon,
  title,
  description,
  action,
}: {
  number: number
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex gap-3">
      <div
        className={cn(
          'flex items-center justify-center w-7 h-7 rounded-full shrink-0 text-sm font-bold',
          'bg-secondary/50 border border-border/50 text-muted-foreground'
        )}
      >
        {number}
      </div>
      <div className="flex-1 min-w-0 pt-0.5">
        <div className="flex items-center gap-2 mb-0.5">
          <Icon className={cn('w-4 h-4', 'text-muted-foreground')} />
          <span className={cn('text-sm font-medium', 'text-foreground')}>
            {title}
          </span>
        </div>
        <p className="text-xs text-muted-foreground mb-1.5">{description}</p>
        {action}
      </div>
    </div>
  )
}
