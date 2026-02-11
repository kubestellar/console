import { useState } from 'react'
import { CheckCircle2, Monitor, Key, Rocket, X, Settings, ExternalLink } from 'lucide-react'
import { Link } from 'react-router-dom'
import { cn } from '../../lib/cn'

const DISMISSED_KEY = 'kc-welcome-dismissed'

export function WelcomeCard() {
  const [dismissed, setDismissed] = useState(() =>
    localStorage.getItem(DISMISSED_KEY) === 'true'
  )

  if (dismissed) return null

  const handleDismiss = () => {
    setDismissed(true)
    localStorage.setItem(DISMISSED_KEY, 'true')
  }

  return (
    <div className="mb-4 rounded-xl border border-purple-500/30 bg-gradient-to-br from-purple-500/5 via-blue-500/5 to-transparent p-5 relative">
      <button
        onClick={handleDismiss}
        className="absolute top-3 right-3 p-1 rounded-lg hover:bg-white/10 transition-colors text-muted-foreground hover:text-foreground"
        title="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>

      <div className="flex items-center gap-3 mb-4">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-blue-500 shadow-lg shadow-purple-500/20">
          <Rocket className="w-5 h-5 text-white" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-foreground">Getting Started</h3>
          <p className="text-sm text-muted-foreground">You're up and running — just a few optional steps left</p>
        </div>
      </div>

      <div className="space-y-3">
        <Step
          number={1}
          icon={CheckCircle2}
          title="Console is running"
          description="Your KubeStellar Console is up and ready."
          done
        />
        <Step
          number={2}
          icon={Monitor}
          title="Connect a cluster"
          description="Clusters are auto-detected from your kubeconfig. Place a kubeconfig at ~/.kube/config or configure via Settings."
          action={
            <Link
              to="/settings"
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-purple-500/15 border border-purple-500/30 hover:bg-purple-500/25 text-purple-300 font-medium transition-colors"
            >
              <Settings className="w-3.5 h-3.5" />
              Open Settings
            </Link>
          }
        />
        <Step
          number={3}
          icon={Key}
          title="Optional: Enable AI features"
          description="Add API keys for Anthropic, OpenAI, or Google to enable AI-powered predictions and card suggestions."
          action={
            <Link
              to="/settings"
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-secondary/50 border border-border/50 hover:bg-secondary/80 text-muted-foreground hover:text-foreground transition-colors"
            >
              <Settings className="w-3.5 h-3.5" />
              Settings
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
          Documentation
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
