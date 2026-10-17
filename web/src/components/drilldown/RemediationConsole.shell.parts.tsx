import { KeyboardEvent, RefObject } from 'react'
import type { TFunction } from 'i18next'
import { X, Play, Pause, CheckCircle, Loader2, Copy, Download, Send, AlertTriangle, RefreshCw } from 'lucide-react'
import { cn } from '../../lib/cn'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import type { LogEntry } from './RemediationConsole.types'
import { handleButtonLikeKeyDown } from './RemediationConsole.parts'

interface RemediationShellOutputProps {
  logs: LogEntry[]
  cluster: string
  namespace: string
  quickCommands: Array<{ label: string; cmd: string }>
  executeCommand: (cmd: string) => void
  isExecuting: boolean
  logsEndRef: RefObject<HTMLDivElement | null>
  t: TFunction
}

export function RemediationShellOutput({ logs, cluster, namespace, quickCommands, executeCommand, isExecuting, logsEndRef, t }: RemediationShellOutputProps) {
  const shellLogs = logs.filter(l => l.type === 'command' || l.type === 'output' || l.type === 'error')

  return (
    <div className="space-y-2">
      {/* Quick commands */}
      <div className="flex flex-wrap gap-2 mb-4 pb-4 border-b border-border/30">
        {quickCommands.map((qc, i) => (
          <Button
            key={i}
            variant="ghost"
            size="sm"
            onClick={() => executeCommand(qc.cmd)}
            disabled={isExecuting}
            className="bg-card/50 border border-border hover:border-green-500/50"
          >
            {qc.label}
          </Button>
        ))}
      </div>

      {/* Shell output */}
      {shellLogs.length === 0 ? (
        <div className="text-muted-foreground">
          <p className="mb-2">{t('remediation.welcomeShell')}</p>
          <p className="text-xs">{t('remediation.clusterContext')} <span className="text-green-400">{cluster}</span></p>
          <p className="text-xs">{t('remediation.namespaceContext')} <span className="text-green-400">{namespace}</span></p>
          <p className="text-xs mt-4">{t('remediation.typeKubectl')}</p>
        </div>
      ) : (
        shellLogs.map(log => (
          <div key={log.id}>
            {log.type === 'command' ? (
              <div className="text-green-400">{log.message}</div>
            ) : log.type === 'error' ? (
              <pre className="text-red-400 whitespace-pre-wrap">{log.message}</pre>
            ) : (
              <pre className="text-muted-foreground whitespace-pre-wrap">{log.message}</pre>
            )}
          </div>
        ))
      )}
      {isExecuting && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>{t('common.executing')}</span>
        </div>
      )}
      <div ref={logsEndRef} />
    </div>
  )
}

interface RemediationShellInputProps {
  shellError: string | null
  lastFailedCommand: string
  executeCommand: (cmd: string) => void
  isExecuting: boolean
  shellInputRef: RefObject<HTMLInputElement | null>
  shellCommand: string
  updateShell: (patch: { command: string }) => void
  handleShellKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void
  t: TFunction
}

export function RemediationShellInput({
  shellError,
  lastFailedCommand,
  executeCommand,
  isExecuting,
  shellInputRef,
  shellCommand,
  updateShell,
  handleShellKeyDown,
  t,
}: RemediationShellInputProps) {
  return (
    <div className="p-3 border-t border-border bg-terminal">
      {shellError && (
        <div className="mb-2 px-3 py-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-xs">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-3 h-3 shrink-0" />
            <span>{shellError}</span>
          </div>
          {lastFailedCommand && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                executeCommand(lastFailedCommand)
              }}
              disabled={isExecuting}
              className="bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 hover:text-yellow-300"
            >
              <RefreshCw className={`w-3 h-3 ${isExecuting ? 'animate-spin' : ''}`} />
              <span>{t('remediation.retryCommand')}</span>
            </Button>
          )}
        </div>
      )}
      <div className="flex items-center gap-2">
        <span className="text-green-400">$</span>
        <Input
          ref={shellInputRef}
          type="text"
          value={shellCommand}
          onChange={(e) => updateShell({ command: e.target.value })}
          onKeyDown={handleShellKeyDown}
          placeholder={t('remediation.enterCommand')}
          disabled={isExecuting}
          className="flex-1 bg-transparent border-none text-foreground placeholder:text-muted-foreground"
          autoFocus
        />
        <div
          role="button"
          tabIndex={isExecuting || !shellCommand.trim() ? -1 : 0}
          aria-disabled={isExecuting || !shellCommand.trim()}
          aria-label={t('remediation.sendCommand')}
          onClick={() => {
            if (!isExecuting && shellCommand.trim()) {
              executeCommand(shellCommand)
            }
          }}
          onKeyDown={(event) => handleButtonLikeKeyDown(event, () => executeCommand(shellCommand), isExecuting || !shellCommand.trim())}
          className={cn(
            'p-2 rounded hover:bg-card/50 text-muted-foreground hover:text-green-400',
            isExecuting || !shellCommand.trim() ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
          )}
        >
          <Send className="w-4 h-4" />
        </div>
      </div>
    </div>
  )
}

interface RemediationFooterProps {
  activeTab: 'ai' | 'shell'
  isRunning: boolean
  isComplete: boolean
  isPaused: boolean
  setIsPaused: (paused: boolean) => void
  startRemediation: () => void
  stopRemediation: () => void
  logs: LogEntry[]
  copyLogs: () => void
  downloadLogs: () => void
  t: TFunction
}

export function RemediationFooter({
  activeTab,
  isRunning,
  isComplete,
  isPaused,
  setIsPaused,
  startRemediation,
  stopRemediation,
  logs,
  copyLogs,
  downloadLogs,
  t,
}: RemediationFooterProps) {
  return (
    <div className="flex items-center justify-between p-4 border-t border-border">
      <div className="flex items-center gap-2">
        {activeTab === 'ai' && (
          <>
            {!isRunning && !isComplete && (
              <div
                role="button"
                tabIndex={0}
                aria-label={t('remediation.startRemediation')}
                onClick={startRemediation}
                onKeyDown={(event) => handleButtonLikeKeyDown(event, startRemediation)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-500 hover:bg-purple-600 text-foreground transition-colors cursor-pointer"
              >
                <Play className="w-4 h-4" />
                {t('remediation.startRemediation')}
              </div>
            )}
            {isRunning && (
              <>
                <div
                  role="button"
                  tabIndex={0}
                  aria-label={isPaused ? t('remediation.resume') : t('remediation.pause')}
                  onClick={() => setIsPaused(!isPaused)}
                  onKeyDown={(event) => handleButtonLikeKeyDown(event, () => setIsPaused(!isPaused))}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-yellow-500 hover:bg-yellow-600 text-foreground transition-colors cursor-pointer"
                >
                  {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                  {isPaused ? t('remediation.resume') : t('remediation.pause')}
                </div>
                <Button
                  variant="danger"
                  size="lg"
                  onClick={stopRemediation}
                  className="px-4"
                >
                  <X className="w-4 h-4" />
                  {t('remediation.stop')}
                </Button>
              </>
            )}
            {isComplete && (
              <div className="flex items-center gap-2 text-green-400">
                <CheckCircle className="w-5 h-5" />
                <span>{t('remediation.analysisComplete')}</span>
              </div>
            )}
          </>
        )}
        {activeTab === 'shell' && (
          <div className="text-xs text-muted-foreground">
            {t('remediation.commandHistory')}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <div
          role="button"
          tabIndex={logs.length === 0 ? -1 : 0}
          aria-disabled={logs.length === 0}
          aria-label={t('remediation.copyLogs')}
          onClick={() => {
            if (logs.length > 0) {
              copyLogs()
            }
          }}
          onKeyDown={(event) => handleButtonLikeKeyDown(event, copyLogs, logs.length === 0)}
          className={cn(
            'p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground',
            logs.length === 0 ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
          )}
          title={t('remediation.copyLogs')}
        >
          <Copy className="w-4 h-4" />
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={downloadLogs}
          disabled={logs.length === 0}
          className="p-2 hover:bg-secondary"
          title={t('remediation.downloadLogs')}
        >
          <Download className="w-4 h-4" />
        </Button>
      </div>
    </div>
  )
}
