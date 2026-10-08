import { COPY_FEEDBACK_TIMEOUT_MS } from '../lib/constants'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Terminal, Globe, Copy, Check, Package } from 'lucide-react'
import { emitWhiteLabelTabSwitch, emitWhiteLabelCommandCopy, emitInstallCommandCopied } from '../lib/analytics'
import { copyToClipboard } from '../lib/clipboard'
import { cn } from '@/lib/cn'
import { useTabKeyboardNav } from '../hooks/useKeyboardNav'
import {
  DEPLOY_TABS,
  BINARY_STEPS,
  HELM_STEPS,
  DOCKER_STEPS,
  type DeployTab } from './WhiteLabel.data'

/*  Deployment section with tabbed binary / helm / docker options      */

export function DeploymentSection() {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<DeployTab>('helm')
  const [copyFeedback, setCopyFeedback] = useState({ stepKey: null as string | null, token: 0 })
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    return () => clearTimeout(copiedTimerRef.current)
  }, [])

  useEffect(() => {
    if (copyFeedback.stepKey === null) return

    clearTimeout(copiedTimerRef.current)
    copiedTimerRef.current = setTimeout(() => {
      setCopyFeedback(current => current.token === copyFeedback.token
        ? { ...current, stepKey: null }
        : current)
    }, COPY_FEEDBACK_TIMEOUT_MS)

    return () => clearTimeout(copiedTimerRef.current)
  }, [copyFeedback])

  const switchTab = useCallback((tab: DeployTab) => {
    if (tab === activeTab) return
    setActiveTab(tab)
    emitWhiteLabelTabSwitch(tab)
  }, [activeTab])

  const { tabListProps, getTabProps } = useTabKeyboardNav<DeployTab>({
    tabs: DEPLOY_TABS,
    activeTab,
    onChange: switchTab,
  })

  const copyCommands = useCallback(async (commands: string[], step: number) => {
    const text = commands.filter(c => !c.startsWith('#') && c !== '').join('\n')
    const ok = await copyToClipboard(text)
    if (!ok) return

    setCopyFeedback(current => ({
      stepKey: `${activeTab}-${step}`,
      token: current.token + 1,
    }))

    const firstCommand = commands.find(c => !c.startsWith('#') && c !== '') ?? commands[0]
    emitWhiteLabelCommandCopy(activeTab, step, firstCommand)
    emitInstallCommandCopied('white_label', firstCommand)
  }, [activeTab])

  const steps = useMemo(() => (activeTab === 'binary'
    ? BINARY_STEPS
    : activeTab === 'helm'
      ? HELM_STEPS
      : DOCKER_STEPS), [activeTab])

  return (
    <section id="install" className="max-w-5xl mx-auto px-6 py-16">
      <h2 className="text-3xl font-bold text-center mb-4">
        Deploy with{' '}
        <span className="text-purple-400">your branding</span>
      </h2>
      <div className="text-muted-foreground text-center mb-12">
        All configuration is at runtime via env vars — no fork, no rebuild, no code changes.
      </div>

      {/* Deployment mode tabs */}
      <div className="max-w-3xl mx-auto mb-8">
        <div className="flex rounded-lg border border-border/50 overflow-hidden" {...tabListProps} aria-label="Deployment method">
          <button
            {...getTabProps('binary')}
            aria-label={t('whiteLabel.selectBinaryTab')}
            onClick={() => switchTab('binary')}
            className={cn(
              'flex-1 flex items-center justify-center gap-2.5 px-6 py-3.5 text-sm font-medium transition-colors',
              activeTab === 'binary'
                ? 'border-b-2 border-purple-400 bg-purple-500/20 text-purple-300'
                : 'bg-secondary/30 text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
            )}
          >
            <Terminal className="w-4 h-4" />
            Binary
            <span className="text-xs px-2 py-0.5 rounded-full bg-secondary/50 text-muted-foreground">curl | bash</span>
          </button>
          <button
            {...getTabProps('helm')}
            aria-label={t('whiteLabel.selectHelmTab')}
            onClick={() => switchTab('helm')}
            className={cn(
              'flex-1 flex items-center justify-center gap-2.5 px-6 py-3.5 text-sm font-medium transition-colors',
              activeTab === 'helm'
                ? 'border-b-2 border-purple-400 bg-purple-500/20 text-purple-300'
                : 'bg-secondary/30 text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
            )}
          >
            <Package className="w-4 h-4" />
            Helm
            <span className="text-xs px-2 py-0.5 rounded-full bg-secondary/50 text-muted-foreground">recommended</span>
          </button>
          <button
            {...getTabProps('docker')}
            aria-label={t('whiteLabel.selectDockerTab')}
            onClick={() => switchTab('docker')}
            className={cn(
              'flex-1 flex items-center justify-center gap-2.5 px-6 py-3.5 text-sm font-medium transition-colors',
              activeTab === 'docker'
                ? 'border-b-2 border-purple-400 bg-purple-500/20 text-purple-300'
                : 'bg-secondary/30 text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
            )}
          >
            <Globe className="w-4 h-4" />
            Docker
          </button>
        </div>
      </div>

      <div className="space-y-6 max-w-3xl mx-auto">
        {steps.map((s) => {
          const copyKey = `${activeTab}-${s.step}`
          const isCopied = copyFeedback.stepKey === copyKey
          return (
            <div
              key={copyKey}
              className="rounded-xl border border-border/50 bg-secondary/30 p-6"
            >
              <div className="flex items-start gap-4">
                <div className="shrink-0 w-8 h-8 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center font-bold text-sm">
                  {s.step}
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold mb-2">{s.title}</h3>
                  {s.commands && s.commands.length > 0 && (
                    <div className="relative group">
                      <pre className="bg-card border border-border/50 rounded-lg px-4 py-3 mb-3 text-sm text-green-400 overflow-x-auto pr-12">
                        <code>{s.commands.map((cmd, i) => (
                          <span key={i}>{i > 0 && '\n'}{cmd.startsWith('#') ? <span className="text-slate-500">{cmd}</span> : cmd === '' ? '' : <>$ {cmd}</>}</span>
                        ))}</code>
                      </pre>
                      <button
                        onClick={() => copyCommands(s.commands!, s.step)}
                        className="absolute top-2.5 right-2.5 p-1.5 rounded-md bg-card border border-border/50 text-muted-foreground hover:text-white hover:border-border transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                        aria-label={t('whiteLabel.copyCommands')}
                      >
                        {isCopied ? (
                          <Check className="w-3.5 h-3.5 text-green-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  )}
                  {s.note && (
                    <div className="rounded-lg border border-border/30 bg-card/50 px-4 py-2.5 mb-3 text-xs text-muted-foreground">
                      {s.note}
                    </div>
                  )}
                  <p className="text-sm text-muted-foreground">{s.description}</p>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
