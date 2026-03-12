import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, Monitor, Key, Rocket, X, Settings, ExternalLink, Plus, Link2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { cn } from '../../lib/cn'

const DISMISSED_KEY = 'kc-welcome-dismissed'

export function WelcomeCard() {
  const { t } = useTranslation()
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISSED_KEY) === 'true'
    } catch {
      return false
    }
  })

  if (dismissed) return null

  const handleDismiss = () => {
    setDismissed(true)
    try {
      localStorage.setItem(DISMISSED_KEY, 'true')
    } catch {
      // Ignore storage errors (e.g. private browsing)
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

      {/* Hero banner — big friendly greeting per #2207 */}
      <div className="flex items-center gap-3 mb-3">
        <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-blue-500 shadow-lg shadow-purple-500/20">
          <Rocket className="w-6 h-6 text-white" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-foreground">{t('dashboard.welcome.gettingStarted')}</h3>
          <p className="text-sm text-muted-foreground">{t('dashboard.welcome.subtitle')}</p>
        </div>
      </div>

      {/* No-clusters hero message */}
      <div className="mb-4 p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
        <p className="text-sm font-medium text-foreground mb-1">{t('dashboard.welcome.noClustersHero')}</p>
        <p className="text-xs text-muted-foreground">{t('dashboard.welcome.noClustersHint')}</p>
      </div>

      {/* Quick-action cards for cluster creation / connection */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
        <a
          href="https://console-docs.kubestellar.io/getting-started/create-cluster"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 p-3 rounded-lg bg-secondary/30 border border-border/50 hover:border-purple-500/30 hover:bg-secondary/50 transition-all text-left group"
        >
          <div className="p-2 rounded-lg bg-purple-500/10 group-hover:bg-purple-500/20 transition-colors flex-shrink-0">
            <Plus className="w-4 h-4 text-purple-400" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{t('dashboard.welcome.createCluster')}</p>
            <p className="text-xs text-muted-foreground truncate">{t('dashboard.welcome.createClusterDesc')}</p>
          </div>
        </a>
        <Link
          to="/settings"
          className="flex items-center gap-3 p-3 rounded-lg bg-secondary/30 border border-border/50 hover:border-blue-500/30 hover:bg-secondary/50 transition-all text-left group"
        >
          <div className="p-2 rounded-lg bg-blue-500/10 group-hover:bg-blue-500/20 transition-colors flex-shrink-0">
            <Link2 className="w-4 h-4 text-blue-400" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{t('dashboard.welcome.connectCluster')}</p>
            <p className="text-xs text-muted-foreground truncate">{t('dashboard.welcome.connectClusterDesc')}</p>
          </div>
        </Link>
      </div>

      <div className="space-y-3">
        <Step
          number={1}
          icon={CheckCircle2}
          title={t('dashboard.welcome.step1Title')}
          description={t('dashboard.welcome.step1Desc')}
          done
        />
        <Step
          number={2}
          icon={Monitor}
          title={t('dashboard.welcome.step2Title')}
          description={t('dashboard.welcome.step2Desc')}
          action={
            <Link
              to="/settings"
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-purple-500/15 border border-purple-500/30 hover:bg-purple-500/25 text-purple-300 font-medium transition-colors"
            >
              <Settings className="w-3.5 h-3.5" />
              {t('dashboard.welcome.openSettings')}
            </Link>
          }
        />
        <Step
          number={3}
          icon={Key}
          title={t('dashboard.welcome.step3Title')}
          description={t('dashboard.welcome.step3Desc')}
          action={
            <Link
              to="/settings"
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-secondary/50 border border-border/50 hover:bg-secondary/80 text-muted-foreground hover:text-foreground transition-colors"
            >
              <Settings className="w-3.5 h-3.5" />
              {t('settings.title')}
            </Link>
          }
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
  done,
  action,
}: {
  number: number
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
  done?: boolean
  action?: React.ReactNode
}) {
  return (
    <div className="flex gap-3">
      <div
        className={cn(
          'flex items-center justify-center w-7 h-7 rounded-full shrink-0 text-sm font-bold',
          done
            ? 'bg-green-500/20 text-green-400'
            : 'bg-secondary/50 border border-border/50 text-muted-foreground'
        )}
      >
        {done ? <CheckCircle2 className="w-4 h-4" /> : number}
      </div>
      <div className="flex-1 min-w-0 pt-0.5">
        <div className="flex items-center gap-2 mb-0.5">
          <Icon className={cn('w-4 h-4', done ? 'text-green-400' : 'text-muted-foreground')} />
          <span className={cn('text-sm font-medium', done ? 'text-green-400' : 'text-foreground')}>
            {title}
          </span>
        </div>
        <p className="text-xs text-muted-foreground mb-1.5">{description}</p>
        {action}
      </div>
    </div>
  )
}
