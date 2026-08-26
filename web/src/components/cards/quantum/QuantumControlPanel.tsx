import React from 'react'
import { AlertCircle, Zap } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useReportCardDataState } from '../CardDataContext'
import { CustomQASMModal } from './CustomQASMModal'
import { useQuantumControls } from './hooks/useQuantumControls'
import { QuantumControlsSection } from './QuantumControlsSection'
import { QuantumStatusPanel } from './QuantumStatusPanel'

export const QuantumControlPanel: React.FC = () => {
  const { t } = useTranslation(['cards', 'common'])
  const q = useQuantumControls()

  useReportCardDataState({
    isLoading: q.isAuthenticated ? q.isLoading && q.status === null : false,
    isRefreshing: q.isRefreshing || q.isAuthRefreshing,
    isDemoData: q.isAuthenticated ? q.isDemoFallback : false,
    hasData: q.isAuthenticated ? q.status !== null : false,
    isFailed: q.isStatusFailed || q.fatalError !== null,
    consecutiveFailures: q.consecutiveFailures,
  })

  if (q.authIsLoading) {
    return (
      <div className="p-4 space-y-3">
        <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-40" />
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full" />
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
      </div>
    )
  }

  if (!q.isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center p-8 gap-4 text-center">
        <p className="text-muted-foreground">Please log in to view quantum data</p>
        <button
          onClick={() => q.login()}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
        >
          Continue with GitHub
        </button>
      </div>
    )
  }

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <Zap className="w-5 h-5 text-blue-500" />
        Quantum Demonstration Controls
      </h3>

      {q.error && !q.isDemoFallback && (
        <div
          data-testid="quantum-control-panel-fatal-banner"
          role="alert"
          className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 flex items-start gap-2"
        >
          <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-red-700 dark:text-red-300">{q.error}</p>
        </div>
      )}

      {q.isAuthErrorTransient && q.requiresIBM && !q.isDemoFallback && (
        <div
          data-testid="quantum-control-panel-transient-banner"
          role="status"
          className="mb-4 p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 flex items-start gap-2"
        >
          <AlertCircle className="w-4 h-4 text-yellow-600 dark:text-yellow-400 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-yellow-700 dark:text-yellow-300">
            {t('quantumControlPanel.ibmUpstreamUnavailable')}
          </p>
        </div>
      )}

      <QuantumControlsSection
        control={q.control}
        setControl={q.setControl}
        ibmCredentialState={q.ibmCredentialState}
        isAuthRefreshing={q.isAuthRefreshing}
        isClearing={q.isClearing}
        isExecuting={q.isExecuting}
        showClearCredentialsDialog={q.showClearCredentialsDialog}
        qasmFiles={q.qasmFiles}
        qasmFilesLoading={q.qasmFilesLoading}
        customQasmContent={q.customQasmContent}
        onOpenCredentials={q.handleOpenCredentialsDialog}
        onRefetchAuth={q.refetchAuthStatus}
        onSetShowClearDialog={q.setShowClearCredentialsDialog}
        onClearCredentials={q.handleClearCredentials}
        onExecute={q.handleExecute}
        onLoopModeToggle={q.handleLoopModeToggle}
        onQasmFileChange={q.handleQasmFileChange}
        onEditCustomQasm={q.customQasmModal.open}
        LARGE_CIRCUIT_QASM={q.LARGE_CIRCUIT_QASM}
      />

      <QuantumStatusPanel
        statusTab={q.statusTab}
        onTabChange={q.setStatusTab}
        displayStatus={q.displayStatus}
        isHealthy={q.isHealthy}
        lastExecution={q.control.last_execution}
      />

      <div className="mt-4 text-xs text-gray-500 dark:text-gray-400">
        <p className="flex items-center gap-1">
          <Zap className="w-3 h-3" />
          Control-based execution via API proxy
        </p>
      </div>

      <CustomQASMModal
        isOpen={q.customQasmModal.isOpen}
        initialContent={q.customQasmContent}
        onSubmit={q.handleCustomQasmSubmit}
        onCancel={q.handleCustomQasmCancel}
      />
    </div>
  )
}
