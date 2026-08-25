import React from 'react'
import { Loader2, Play, RefreshCw, Trash2, Key, Check, ShieldCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../../lib/cn'
import { ConfirmDialog } from '../../../lib/modals/ConfirmDialog'
import type { ControlState } from './hooks/useQuantumControls'
import { BACKENDS_REQUIRING_IBM } from './hooks/useQuantumControls'

interface Props {
  control: ControlState
  setControl: React.Dispatch<React.SetStateAction<ControlState>>
  ibmCredentialState: 'configured' | 'stored' | 'none'
  isAuthRefreshing: boolean
  isClearing: boolean
  isExecuting: boolean
  showClearCredentialsDialog: boolean
  qasmFiles: { name: string }[]
  qasmFilesLoading: boolean
  customQasmContent: string
  onOpenCredentials: () => void
  onRefetchAuth: () => void
  onSetShowClearDialog: (val: boolean) => void
  onClearCredentials: () => Promise<void>
  onExecute: () => Promise<void>
  onLoopModeToggle: () => Promise<void>
  onQasmFileChange: (val: string) => void
  onEditCustomQasm: () => void
  LARGE_CIRCUIT_QASM: string
}

export const QuantumControlsSection: React.FC<Props> = ({
  control,
  setControl,
  ibmCredentialState,
  isAuthRefreshing,
  isClearing,
  isExecuting,
  showClearCredentialsDialog,
  qasmFiles,
  qasmFilesLoading,
  customQasmContent,
  onOpenCredentials,
  onRefetchAuth,
  onSetShowClearDialog,
  onClearCredentials,
  onExecute,
  onLoopModeToggle,
  onQasmFileChange,
  onEditCustomQasm,
  LARGE_CIRCUIT_QASM,
}) => {
  const { t } = useTranslation(['cards', 'common'])
  const is32Qubit = control.qasm_file === LARGE_CIRCUIT_QASM
  const requiresIBM = BACKENDS_REQUIRING_IBM.has(control.backend)

  return (
    <div className="space-y-4">
      {/* IBM Credentials Button with Clear Option */}
      <div className="flex gap-2 items-stretch">
        <button
          onClick={onOpenCredentials}
          className="flex-1 px-3 py-2 flex items-center justify-between rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Key className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('quantumControlPanel.ibmCredentialsLabel')}</span>
          </div>
          <div className={cn('flex items-center gap-1 text-xs font-semibold',
            ibmCredentialState === 'configured' && 'text-green-600 dark:text-green-400',
            ibmCredentialState === 'stored' && 'text-blue-600 dark:text-blue-400',
            ibmCredentialState === 'none' && 'text-gray-500 dark:text-gray-400',
          )}>
            {ibmCredentialState === 'configured' && (
              <>
                <ShieldCheck className="w-3 h-3" />
                {t('quantumControlPanel.credsConfigured')}
              </>
            )}
            {ibmCredentialState === 'stored' && (
              <>
                <Check className="w-3 h-3" />
                {t('quantumControlPanel.credsStored')}
              </>
            )}
            {ibmCredentialState === 'none' && t('quantumControlPanel.credsNone')}
          </div>
        </button>
        {ibmCredentialState === 'stored' && (
          <button
            onClick={() => { void onRefetchAuth() }}
            disabled={isAuthRefreshing}
            className="px-3 py-2 rounded-lg border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors disabled:opacity-50 flex items-center"
            title={t('quantumControlPanel.validateNow')}
            aria-label={t('quantumControlPanel.validateNow')}
          >
            <RefreshCw className={cn('w-4 h-4 text-blue-600 dark:text-blue-400', isAuthRefreshing && 'animate-spin')} />
          </button>
        )}
        {ibmCredentialState !== 'none' && (
          <button
            onClick={() => onSetShowClearDialog(true)}
            disabled={isClearing}
            className="px-3 py-2 rounded-lg border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors disabled:opacity-50 flex items-center"
            title={t('quantumControlPanel.clearCredentials')}
          >
            <Trash2 className={`w-4 h-4 ${isClearing ? 'text-gray-400' : 'text-red-600 dark:text-red-400'}`} />
          </button>
        )}
      </div>

      <ConfirmDialog
        isOpen={showClearCredentialsDialog}
        onClose={() => onSetShowClearDialog(false)}
        onConfirm={onClearCredentials}
        title={t('quantumControlPanel.clearCredentialsTitle')}
        message={t('quantumControlPanel.clearCredentialsMessage')}
        confirmLabel={t('quantumControlPanel.clearCredentials')}
        cancelLabel={t('common:actions.cancel')}
        variant="danger"
        isLoading={isClearing}
      />

      {/* Backend Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Backend
        </label>
        <select
          value={control.backend}
          onChange={e => setControl(prev => ({ ...prev, backend: e.target.value }))}
          disabled={control.executing}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm disabled:opacity-50"
        >
          <option value="aer">{t('quantumControlPanel.backendOptions.aerSimulator')}</option>
          <option value="sim">QASM Simulator</option>
          <option value="qx5">IBM 5-qubit</option>
          {ibmCredentialState !== 'none' && (
            <>
              <option value="least">IBM Least Busy (Real Hardware)</option>
              <option value="aer_noise" disabled={is32Qubit}>
                Aer with Real Noise Model{is32Qubit ? ' — too memory-intensive for 32 qubits' : ''}
              </option>
            </>
          )}
        </select>
        {is32Qubit && (
          <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
            32-qubit circuits require too much memory for noisy simulation — noise model options are disabled.
          </p>
        )}
        {!is32Qubit && control.backend === 'aer_noise' && requiresIBM && (
          <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
            Simulates your least busy backend with its real noise characteristics
          </p>
        )}
      </div>

      {/* Shots Configuration */}
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
          Shots
        </label>
        <input
          type="number"
          min="1"
          max="1024"
          value={control.shots}
          onChange={e => {
            const value = parseInt(e.target.value)
            if (!isNaN(value) && value >= 1 && value <= 1024) {
              setControl(prev => ({ ...prev, shots: value }))
            }
          }}
          disabled={control.executing}
          className="w-16 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-xs disabled:opacity-50"
        />
        {([100, 256, 512, 1024] as const).map(n => (
          <button
            key={n}
            onClick={() => setControl(prev => ({ ...prev, shots: n }))}
            disabled={control.executing}
            className="px-2 py-1 text-xs rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50"
          >
            {n}
          </button>
        ))}
      </div>

      {/* QASM File */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          {t('cards:quantumControlPanel.qasmFileLabel')}
        </label>
        <div className="flex gap-2">
          <select
            value={control.qasm_file}
            onChange={e => onQasmFileChange(e.target.value)}
            disabled={control.executing || qasmFilesLoading}
            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm disabled:opacity-50"
          >
            {qasmFilesLoading ? (
              <option>{t('quantumControlPanel.qasmFiles.loadingFiles')}</option>
            ) : (
              <>
                {qasmFiles.length === 0 && <option disabled>No QASM files available</option>}
                {(qasmFiles || []).map(file => (
                  <option key={file.name} value={file.name}>
                    {file.name}
                  </option>
                ))}
                {qasmFiles.length > 0 && <option disabled>─────────────────</option>}
                <option value="custom">{t('quantumControlPanel.qasmFiles.customQasm')}</option>
              </>
            )}
          </select>
          {control.qasm_file === 'custom' && customQasmContent && (
            <button
              onClick={onEditCustomQasm}
              disabled={control.executing}
              className="px-3 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors"
              title="Edit custom QASM"
            >
              <svg className="w-4 h-4 text-gray-700 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
          )}
        </div>
        {control.qasm_file === 'custom' && customQasmContent && (
          <p className="mt-2 text-xs text-blue-600 dark:text-blue-400">
            ✓ Custom circuit loaded ({customQasmContent.length} bytes)
          </p>
        )}
      </div>

      {/* Execute Button + Loop Mode Toggle */}
      <div className="flex gap-2">
        <button
          onClick={onExecute}
          disabled={control.executing || isExecuting}
          className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"
        >
          {(control.executing || isExecuting) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          <span className="text-sm">{(control.executing || isExecuting) ? 'Executing...' : control.loop_mode ? 'Update Parameters' : 'Execute Circuit'}</span>
        </button>
        <button
          onClick={onLoopModeToggle}
          disabled={control.executing}
          className={cn(
            'px-3 py-2 rounded-lg border transition-colors flex items-center gap-2',
            control.loop_mode
              ? 'bg-blue-600 border-blue-700 text-white hover:bg-blue-700'
              : 'bg-gray-200 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
          )}
          title={control.loop_mode ? 'Disable loop mode' : 'Enable loop mode — continuous execution'}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <span className="text-xs font-medium">{control.loop_mode ? 'ON' : 'OFF'}</span>
        </button>
      </div>
    </div>
  )
}
