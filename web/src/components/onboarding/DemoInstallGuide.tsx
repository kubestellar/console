import { useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { X, Copy, Check, ExternalLink, Settings, Rocket, Terminal, Key } from 'lucide-react'
import { useDemoMode } from '../../hooks/useDemoMode'

const DISMISSED_KEY = 'kc-demo-install-dismissed'

function CopyCommand({ command }: { command: string }) {
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
      className="flex items-center gap-2 w-full text-left font-mono text-xs bg-gray-900/80 border border-gray-700/50 rounded px-2.5 py-1.5 hover:border-purple-500/40 hover:bg-gray-800/80 transition-colors group/copy"
      title={copied ? 'Copied!' : 'Click to copy'}
    >
      <span className="flex-1 text-gray-300">{command}</span>
      {copied ? (
        <Check className="w-3.5 h-3.5 text-green-400 shrink-0" />
      ) : (
        <Copy className="w-3.5 h-3.5 text-gray-500 group-hover/copy:text-gray-300 shrink-0 transition-colors" />
      )}
    </button>
  )
}

export function DemoInstallGuide() {
  const { toggleDemoMode } = useDemoMode()
  const [dismissed, setDismissed] = useState(() => {
    return localStorage.getItem(DISMISSED_KEY) === 'true'
  })

  const handleDismiss = useCallback(() => {
    setDismissed(true)
    localStorage.setItem(DISMISSED_KEY, 'true')
  }, [])

  if (dismissed) return null

  return (
    <div className="fixed bottom-5 left-72 z-40 w-[340px] glass rounded-xl border border-purple-500/20 shadow-2xl shadow-purple-900/20 animate-fade-in-up">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3.5 pb-0">
        <div className="flex items-center gap-2">
          <Rocket className="w-4 h-4 text-purple-400" />
          <h3 className="text-sm font-semibold text-foreground">Get Started with Your Own Clusters</h3>
        </div>
        <button
          onClick={handleDismiss}
          className="p-1 -mr-1 rounded hover:bg-white/10 transition-colors"
          title="Dismiss"
        >
          <X className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      </div>

      {/* Steps */}
      <div className="px-4 pt-3 pb-3 space-y-3">
        {/* Step 1 */}
        <div className="flex gap-2.5">
          <div className="flex items-center justify-center w-5 h-5 rounded-full bg-purple-500/20 text-purple-400 text-[10px] font-bold shrink-0 mt-0.5">1</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1">
              <Terminal className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Install the agent</span>
            </div>
            <CopyCommand command="brew install kubestellar/tap/kc-agent" />
          </div>
        </div>

        {/* Step 2 */}
        <div className="flex gap-2.5">
          <div className="flex items-center justify-center w-5 h-5 rounded-full bg-purple-500/20 text-purple-400 text-[10px] font-bold shrink-0 mt-0.5">2</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1">
              <Terminal className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Run it</span>
            </div>
            <CopyCommand command="kc-agent" />
          </div>
        </div>

        {/* Step 3 */}
        <div className="flex gap-2.5">
          <div className="flex items-center justify-center w-5 h-5 rounded-full bg-purple-500/20 text-purple-400 text-[10px] font-bold shrink-0 mt-0.5">3</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Configure AI keys in Settings</span>
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 px-4 pb-3.5 pt-0.5">
        <a
          href="https://kubestellar.io/docs/console"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md bg-secondary/50 hover:bg-secondary/80 text-muted-foreground hover:text-foreground transition-colors"
        >
          Docs
          <ExternalLink className="w-3 h-3" />
        </a>
        <Link
          to="/settings"
          className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md bg-secondary/50 hover:bg-secondary/80 text-muted-foreground hover:text-foreground transition-colors"
        >
          <Settings className="w-3 h-3" />
          Settings
        </Link>
        <button
          onClick={toggleDemoMode}
          className="text-xs px-2.5 py-1.5 rounded-md bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 transition-colors ml-auto"
        >
          Exit Demo
        </button>
      </div>
    </div>
  )
}
