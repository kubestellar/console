/* eslint-disable react-refresh/only-export-components */
import { KeyboardEvent, RefObject, useEffect } from 'react'
import type { TFunction } from 'i18next'
import { Sparkles, X, Loader2, Terminal } from 'lucide-react'
import { cn } from '../../lib/cn'
import type { useTabKeyboardNav } from '../../hooks/useKeyboardNav'
import type { LogEntry } from './RemediationConsole.types'

type TabKeyboardNav = ReturnType<typeof useTabKeyboardNav<'ai' | 'shell'>>

/** Handles Enter/Space activation for div-based "button" elements used throughout this console. */
export function handleButtonLikeKeyDown(
  event: KeyboardEvent<HTMLElement>,
  action: () => void,
  disabled = false,
) {
  if (disabled) {
    return
  }
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    action()
  }
}

interface RemediationHeaderProps {
  activeTab: 'ai' | 'shell'
  resourceType: string
  resourceName: string
  onClose: () => void
  titleId: string
  t: TFunction
}

export function RemediationHeader({ activeTab, resourceType, resourceName, onClose, titleId, t }: RemediationHeaderProps) {
  return (
    <div className="flex items-center justify-between p-4 border-b border-border">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-purple-500/20">
          {activeTab === 'ai' ? (
            <Sparkles className="w-5 h-5 text-purple-400" />
          ) : (
            <Terminal className="w-5 h-5 text-green-400" />
          )}
        </div>
        <div>
          <h2 id={titleId} className="font-semibold text-foreground">
            {activeTab === 'ai' ? t('remediation.title') : t('remediation.shellTitle')}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t('remediation.resourceType', { type: resourceType, name: resourceName })}
          </p>
        </div>
      </div>
      <div
        role="button"
        tabIndex={0}
        onClick={onClose}
        onKeyDown={(event) => handleButtonLikeKeyDown(event, onClose)}
        aria-label="Close"
        className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground cursor-pointer"
      >
        <X className="w-5 h-5" />
      </div>
    </div>
  )
}

interface RemediationTabsProps {
  activeTab: 'ai' | 'shell'
  tabListProps: TabKeyboardNav['tabListProps']
  getTabProps: TabKeyboardNav['getTabProps']
  setActiveTab: (tab: 'ai' | 'shell') => void
  shellInputRef: RefObject<HTMLInputElement | null>
  focusDelayMs: number
  t: TFunction
}

export function RemediationTabs({ activeTab, tabListProps, getTabProps, setActiveTab, shellInputRef, focusDelayMs, t }: RemediationTabsProps) {
  useEffect(() => {
    if (activeTab === 'shell') {
      const timerId = setTimeout(() => shellInputRef.current?.focus(), focusDelayMs)
      return () => clearTimeout(timerId)
    }
  }, [activeTab, focusDelayMs, shellInputRef])
  
  return (
    <div {...tabListProps} className="flex border-b border-border">
      <button
        {...getTabProps('ai')}
        aria-label={t('remediation.aiAnalysis')}
        className={cn(
          'flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors cursor-pointer',
          activeTab === 'ai'
            ? 'text-purple-400 border-b-2 border-purple-500'
            : 'text-muted-foreground hover:text-foreground'
        )}
      >
        <Sparkles className="w-4 h-4" />
        {t('remediation.aiAnalysis')}
      </button>
      <button
        {...getTabProps('shell')}
        onClick={() => {
          setActiveTab('shell')
        }}
        aria-label={t('remediation.shell')}
        className={cn(
          'flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors cursor-pointer',
          activeTab === 'shell'
            ? 'text-green-400 border-b-2 border-green-500'
            : 'text-muted-foreground hover:text-foreground'
        )}
      >
        <Terminal className="w-4 h-4" />
        {t('remediation.shell')}
      </button>
    </div>
  )
}

interface RemediationAiOutputProps {
  logs: LogEntry[]
  isLoadingInitialData: boolean
  isRunning: boolean
  logsEndRef: RefObject<HTMLDivElement | null>
  t: TFunction
}

export function RemediationAiOutput({ logs, isLoadingInitialData, isRunning, logsEndRef, t }: RemediationAiOutputProps) {
  if (logs.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        {isLoadingInitialData ? (
          <>
            <Loader2 className="w-12 h-12 mx-auto mb-4 animate-spin opacity-50" />
            <p>{t('remediation.gatheringData')}</p>
          </>
        ) : (
          <>
            <Sparkles className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>{t('remediation.clickStart')}</p>
            <p className="text-xs mt-2">{t('remediation.claudeWillAnalyze')}</p>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {logs.filter(l => l.type !== 'command' && l.type !== 'output').map(log => (
        <div key={log.id} className="flex gap-3">
          <span className="text-muted-foreground text-xs whitespace-nowrap">
            {log.timestamp.toLocaleTimeString()}
          </span>
          <div className="flex-1">
            <div className="flex items-start gap-2">
              {log.type === 'thinking' && (
                <span className="text-purple-400">🤔</span>
              )}
              {log.type === 'action' && (
                <span className="text-blue-400">⚡</span>
              )}
              {log.type === 'result' && (
                <span className="text-green-400">✅</span>
              )}
              {log.type === 'error' && (
                <span className="text-red-400">❌</span>
              )}
              {log.type === 'info' && (
                <span className="text-muted-foreground">ℹ️</span>
              )}
              <span className={cn(
                log.type === 'thinking' && 'text-purple-300',
                log.type === 'action' && 'text-blue-300',
                log.type === 'result' && 'text-green-300',
                log.type === 'error' && 'text-red-300',
                log.type === 'info' && 'text-muted-foreground',
              )}>
                {log.message}
              </span>
            </div>
            {log.details && (
              <pre className="mt-1 ml-6 p-2 rounded bg-black/50 text-xs text-yellow-300 overflow-x-auto">
                {log.details}
              </pre>
            )}
          </div>
        </div>
      ))}
      {isRunning && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>{t('common.processing')}</span>
        </div>
      )}
      <div ref={logsEndRef} />
    </div>
  )
}
