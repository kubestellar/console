import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FOCUS_DELAY_MS } from '../../lib/constants/network'
import { PageErrorBoundary } from '../PageErrorBoundary'
import { useTabKeyboardNav } from '../../hooks/useKeyboardNav'
import { useRemediationRun } from './useRemediationRun'
import {
  RemediationHeader,
  RemediationTabs,
  RemediationAiOutput,
  RemediationShellOutput,
  RemediationShellInput,
  RemediationFooter,
} from './RemediationConsole.parts'
import type { RemediationConsoleProps } from './RemediationConsole.types'

const REMEDIATION_TABS = ['ai', 'shell'] as const
const REMEDIATION_MODAL_TITLE_ID = 'remediation-console-title'

function RemediationConsoleContent({
  isOpen,
  onClose,
  resourceType,
  resourceName,
  namespace,
  cluster,
  issues,
}: RemediationConsoleProps) {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<'ai' | 'shell'>('ai')
  const { tabListProps, getTabProps } = useTabKeyboardNav<'ai' | 'shell'>({
    tabs: REMEDIATION_TABS,
    activeTab,
    onChange: setActiveTab,
  })

  const {
    logs,
    isRunning,
    isComplete,
    isPaused,
    setIsPaused,
    isLoadingInitialData,
    shellCommand,
    isExecuting,
    shellError,
    lastFailedCommand,
    updateShell,
    logsEndRef,
    shellInputRef,
    startRemediation,
    stopRemediation,
    executeCommand,
    handleShellKeyDown,
    quickCommands,
    copyLogs,
    downloadLogs,
  } = useRemediationRun({ resourceType, resourceName, namespace, cluster, issues })

  useEffect(() => {
    if (!isOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-modal">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={REMEDIATION_MODAL_TITLE_ID}
        className="w-[800px] max-h-[80vh] glass rounded-xl flex flex-col overflow-hidden animate-fade-in-up"
      >
        <RemediationHeader
          activeTab={activeTab}
          resourceType={resourceType}
          resourceName={resourceName}
          onClose={onClose}
          titleId={REMEDIATION_MODAL_TITLE_ID}
          t={t}
        />

        <RemediationTabs
          activeTab={activeTab}
          tabListProps={tabListProps}
          getTabProps={getTabProps}
          setActiveTab={setActiveTab}
          shellInputRef={shellInputRef}
          focusDelayMs={FOCUS_DELAY_MS}
          t={t}
        />

        {/* Console Output */}
        <div className="flex-1 overflow-y-auto p-4 bg-terminal font-mono text-sm">
          {activeTab === 'ai' ? (
            <RemediationAiOutput
              logs={logs}
              isLoadingInitialData={isLoadingInitialData}
              isRunning={isRunning}
              logsEndRef={logsEndRef}
              t={t}
            />
          ) : (
            <RemediationShellOutput
              logs={logs}
              cluster={cluster}
              namespace={namespace}
              quickCommands={quickCommands}
              executeCommand={executeCommand}
              isExecuting={isExecuting}
              logsEndRef={logsEndRef}
              t={t}
            />
          )}
        </div>

        {/* Shell Input (only shown in shell tab) */}
        {activeTab === 'shell' && (
          <RemediationShellInput
            shellError={shellError}
            lastFailedCommand={lastFailedCommand}
            executeCommand={executeCommand}
            isExecuting={isExecuting}
            shellInputRef={shellInputRef}
            shellCommand={shellCommand}
            updateShell={updateShell}
            handleShellKeyDown={handleShellKeyDown}
            t={t}
          />
        )}

        <RemediationFooter
          activeTab={activeTab}
          isRunning={isRunning}
          isComplete={isComplete}
          isPaused={isPaused}
          setIsPaused={setIsPaused}
          startRemediation={startRemediation}
          stopRemediation={stopRemediation}
          logs={logs}
          copyLogs={copyLogs}
          downloadLogs={downloadLogs}
          t={t}
        />
      </div>
    </div>
  )
}

export function RemediationConsole(props: RemediationConsoleProps) {
  return (
    <PageErrorBoundary>
      <RemediationConsoleContent {...props} />
    </PageErrorBoundary>
  )
}
