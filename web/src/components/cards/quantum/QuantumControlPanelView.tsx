import React from 'react'
import { AlertCircle, Check, Key, Loader2, Play, RefreshCw, ShieldCheck, Trash2, Zap } from 'lucide-react'
import { cn } from '../../../lib/cn'
import { ConfirmDialog } from '../../../lib/modals/ConfirmDialog'
import { CustomQASMModal } from './CustomQASMModal'
import { LARGE_CIRCUIT_QASM } from './quantumControlPanelTypes'

interface Props {
  t: (key: string) => string
  authIsLoading: boolean
  isAuthenticated: boolean
  login: () => void
  error: string | null
  isDemoFallback: boolean
  isAuthErrorTransient: boolean
  requiresIBM: boolean
  handleOpenCredentialsDialog: () => void
  ibmCredentialState: 'configured' | 'stored' | 'none'
  refetchAuthStatus: () => Promise<unknown>
  isAuthRefreshing: boolean
  setShowClearCredentialsDialog: React.Dispatch<React.SetStateAction<boolean>>
  isClearing: boolean
  showClearCredentialsDialog: boolean
  handleClearCredentials: () => Promise<void>
  control: {
    backend: string
    shots: number
    qasm_file: string
    executing: boolean
    loop_mode: boolean
    last_execution?: { job_id: string; status: string; timestamp: string }
  }
  setControl: React.Dispatch<React.SetStateAction<Props['control']>>
  qasmFilesLoading: boolean
  qasmFiles: Array<{ name: string }>
  customQasmModal: { isOpen: boolean; open: () => void }
  customQasmContent: string
  setPreviousQasmFile: React.Dispatch<React.SetStateAction<string>>
  handleExecute: () => Promise<void>
  isExecuting: boolean
  handleLoopModeToggle: () => Promise<void>
  statusTab: 'system' | 'job'
  setStatusTab: React.Dispatch<React.SetStateAction<'system' | 'job'>>
  displayStatus: {
    status: string
    loop_running?: boolean
    running?: boolean
    execution_mode?: string
    loop_mode?: boolean
    circuit_info?: { num_qubits?: number }
    control_system?: { command?: string }
    last_result_time?: string
    version_info?: { version?: string; commit?: string }
  }
  isHealthy: boolean
  handleCustomQasmSubmit: (content: string) => void
  handleCustomQasmCancel: () => void
}

export function QuantumControlPanelView(props: Props) {
  const {
    t,
    authIsLoading,
    isAuthenticated,
    login,
    error,
    isDemoFallback,
    isAuthErrorTransient,
    requiresIBM,
    handleOpenCredentialsDialog,
    ibmCredentialState,
    refetchAuthStatus,
    setShowClearCredentialsDialog,
    isAuthRefreshing,
    isClearing,
    showClearCredentialsDialog,
    handleClearCredentials,
    control,
    setControl,
    qasmFilesLoading,
    qasmFiles,
    customQasmModal,
    customQasmContent,
    setPreviousQasmFile,
    handleExecute,
    isExecuting,
    handleLoopModeToggle,
    statusTab,
    setStatusTab,
    displayStatus,
    isHealthy,
    handleCustomQasmSubmit,
    handleCustomQasmCancel,
  } = props

  if (authIsLoading) {
    return <div className="p-4 space-y-3"><div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-40" /><div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full" /><div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4" /></div>
  }

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center p-8 gap-4 text-center">
        <p className="text-muted-foreground">Please log in to view quantum data</p>
        <button onClick={() => login()} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition">Continue with GitHub</button>
      </div>
    )
  }

  const is32Qubit = control.qasm_file === LARGE_CIRCUIT_QASM

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2"><Zap className="w-5 h-5 text-blue-500" />Quantum Demonstration Controls</h3>
      {error && !isDemoFallback && <div data-testid="quantum-control-panel-fatal-banner" role="alert" className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 flex items-start gap-2"><AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" /><p className="text-sm text-red-700 dark:text-red-300">{error}</p></div>}
      {isAuthErrorTransient && requiresIBM && !isDemoFallback && <div data-testid="quantum-control-panel-transient-banner" role="status" className="mb-4 p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 flex items-start gap-2"><AlertCircle className="w-4 h-4 text-yellow-600 dark:text-yellow-400 mt-0.5 flex-shrink-0" /><p className="text-sm text-yellow-700 dark:text-yellow-300">{t('quantumControlPanel.ibmUpstreamUnavailable')}</p></div>}
      <div className="space-y-4">
        <div className="flex gap-2 items-stretch">
          <button onClick={handleOpenCredentialsDialog} className="flex-1 px-3 py-2 flex items-center justify-between rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
            <div className="flex items-center gap-2"><Key className="w-4 h-4 text-blue-600 dark:text-blue-400" /><span className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('quantumControlPanel.ibmCredentialsLabel')}</span></div>
            <div className={cn('flex items-center gap-1 text-xs font-semibold', ibmCredentialState === 'configured' && 'text-green-600 dark:text-green-400', ibmCredentialState === 'stored' && 'text-blue-600 dark:text-blue-400', ibmCredentialState === 'none' && 'text-gray-500 dark:text-gray-400')}>
              {ibmCredentialState === 'configured' && <><ShieldCheck className="w-3 h-3" />{t('quantumControlPanel.credsConfigured')}</>}
              {ibmCredentialState === 'stored' && <><Check className="w-3 h-3" />{t('quantumControlPanel.credsStored')}</>}
              {ibmCredentialState === 'none' && t('quantumControlPanel.credsNone')}
            </div>
          </button>
          {ibmCredentialState === 'stored' && <button onClick={() => { void refetchAuthStatus() }} disabled={isAuthRefreshing} className="px-3 py-2 rounded-lg border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors disabled:opacity-50 flex items-center" title={t('quantumControlPanel.validateNow')} aria-label={t('quantumControlPanel.validateNow')}><RefreshCw className={cn('w-4 h-4 text-blue-600 dark:text-blue-400', isAuthRefreshing && 'animate-spin')} /></button>}
          {ibmCredentialState !== 'none' && <button onClick={() => setShowClearCredentialsDialog(true)} disabled={isClearing} className="px-3 py-2 rounded-lg border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors disabled:opacity-50 flex items-center" title={t('quantumControlPanel.clearCredentials')}><Trash2 className={`w-4 h-4 ${isClearing ? 'text-gray-400' : 'text-red-600 dark:text-red-400'}`} /></button>}
        </div>

        <ConfirmDialog isOpen={showClearCredentialsDialog} onClose={() => setShowClearCredentialsDialog(false)} onConfirm={handleClearCredentials} title={t('quantumControlPanel.clearCredentialsTitle')} message={t('quantumControlPanel.clearCredentialsMessage')} confirmLabel={t('quantumControlPanel.clearCredentials')} cancelLabel={t('common:actions.cancel')} variant="danger" isLoading={isClearing} />

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Backend</label>
          <select value={control.backend} onChange={e => setControl(prev => ({ ...prev, backend: e.target.value }))} disabled={control.executing} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm disabled:opacity-50">
            <option value="aer">{t('quantumControlPanel.backendOptions.aerSimulator')}</option>
            <option value="sim">QASM Simulator</option>
            <option value="qx5">IBM 5-qubit</option>
            {ibmCredentialState !== 'none' && <><option value="least">IBM Least Busy (Real Hardware)</option><option value="aer_noise" disabled={is32Qubit}>Aer with Real Noise Model{is32Qubit ? ' — too memory-intensive for 32 qubits' : ''}</option></>}
          </select>
          {is32Qubit && <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">32-qubit circuits require too much memory for noisy simulation — noise model options are disabled.</p>}
          {!is32Qubit && control.backend === 'aer_noise' && <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">Simulates your least busy backend with its real noise characteristics</p>}
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">Shots</label>
          <input type="number" min="1" max="1024" value={control.shots} onChange={e => { const value = parseInt(e.target.value); if (!isNaN(value) && value >= 1 && value <= 1024) { setControl(prev => ({ ...prev, shots: value })) } }} disabled={control.executing} className="w-16 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-xs disabled:opacity-50" />
          {[100, 256, 512, 1024].map(value => <button key={value} onClick={() => setControl(prev => ({ ...prev, shots: value }))} disabled={control.executing} className="px-2 py-1 text-xs rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50">{value}</button>)}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t('cards:quantumControlPanel.qasmFileLabel')}</label>
          <div className="flex gap-2">
            <select value={control.qasm_file} onChange={e => { const val = e.target.value; if (val === 'custom') { setPreviousQasmFile(control.qasm_file); customQasmModal.open() } else { const newBackend = val === LARGE_CIRCUIT_QASM && control.backend === 'aer_noise' ? 'aer' : control.backend; setControl(prev => ({ ...prev, qasm_file: val, backend: newBackend })) } }} disabled={control.executing || qasmFilesLoading} className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm disabled:opacity-50">
              {qasmFilesLoading ? <option>{t('quantumControlPanel.qasmFiles.loadingFiles')}</option> : <>{qasmFiles.length === 0 && <option disabled>No QASM files available</option>}{qasmFiles.map(file => <option key={file.name} value={file.name}>{file.name}</option>)}{qasmFiles.length > 0 && <option disabled>─────────────────</option>}<option value="custom">{t('quantumControlPanel.qasmFiles.customQasm')}</option></>}
            </select>
            {control.qasm_file === 'custom' && customQasmContent && <button onClick={customQasmModal.open} disabled={control.executing} className="px-3 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors" title="Edit custom QASM"><svg className="w-4 h-4 text-gray-700 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg></button>}
          </div>
          {control.qasm_file === 'custom' && customQasmContent && <p className="mt-2 text-xs text-blue-600 dark:text-blue-400">✓ Custom circuit loaded ({customQasmContent.length} bytes)</p>}
        </div>

        <div className="flex gap-2">
          <button onClick={handleExecute} disabled={control.executing || isExecuting} className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium flex items-center justify-center gap-2 transition-colors">{(control.executing || isExecuting) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}<span className="text-sm">{(control.executing || isExecuting) ? 'Executing...' : control.loop_mode ? 'Update Parameters' : 'Execute Circuit'}</span></button>
          <button onClick={handleLoopModeToggle} disabled={control.executing} className={cn('px-3 py-2 rounded-lg border transition-colors flex items-center gap-2', control.loop_mode ? 'bg-blue-600 border-blue-700 text-white hover:bg-blue-700' : 'bg-gray-200 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600')} title={control.loop_mode ? 'Disable loop mode' : 'Enable loop mode — continuous execution'}><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg><span className="text-xs font-medium">{control.loop_mode ? 'ON' : 'OFF'}</span></button>
        </div>

        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 overflow-hidden">
          <div className="flex gap-0 border-b border-gray-200 dark:border-gray-700">
            <button onClick={() => setStatusTab('system')} className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${statusTab === 'system' ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-b-2 border-blue-500' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}`}>System Status</button>
            <button onClick={() => setStatusTab('job')} className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${statusTab === 'job' ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-b-2 border-blue-500' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}`}>Last Job</button>
          </div>
          <div className="p-3">
            {statusTab === 'system' ? <div className="space-y-1 text-sm"><div className="flex justify-between"><span className="text-gray-600 dark:text-gray-400">Status:</span><span className={`font-semibold ${isHealthy ? 'text-green-400' : 'text-yellow-400'}`}>{displayStatus.loop_running ? 'loop_running' : displayStatus.status}</span></div><div className="flex justify-between"><span className="text-gray-600 dark:text-gray-400">Running:</span><span className={displayStatus.running ? 'text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400'}>{displayStatus.running ? 'Yes' : 'No'}</span></div><div className="flex justify-between"><span className="text-gray-600 dark:text-gray-400">Mode:</span><span className="text-gray-900 dark:text-gray-100 font-mono text-xs">{displayStatus.execution_mode}</span></div><div className="flex justify-between"><span className="text-gray-600 dark:text-gray-400">Loop:</span><span className={`text-xs font-semibold ${displayStatus.loop_mode ? 'text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400'}`}>{displayStatus.loop_mode ? 'ON' : 'OFF'}</span></div>{displayStatus.circuit_info && <div className="flex justify-between"><span className="text-gray-600 dark:text-gray-400">Qubits:</span><span className="text-gray-900 dark:text-gray-100 text-xs">{displayStatus.circuit_info.num_qubits}</span></div>}{displayStatus.control_system && <div className="flex justify-between"><span className="text-gray-600 dark:text-gray-400">Command:</span><span className="text-gray-900 dark:text-gray-100 text-xs">{displayStatus.control_system.command}</span></div>}{displayStatus.last_result_time && <div className="flex justify-between"><span className="text-gray-600 dark:text-gray-400">Result Time:</span><span className="text-gray-900 dark:text-gray-100 text-xs">{new Date(displayStatus.last_result_time).toLocaleTimeString()}</span></div>}{displayStatus.version_info && <><div className="flex justify-between pt-1 border-t border-gray-300 dark:border-gray-600 mt-2"><span className="text-gray-600 dark:text-gray-400">Backend Ver:</span><span className="text-gray-900 dark:text-gray-100 text-xs font-mono font-semibold">{displayStatus.version_info.version}</span></div>{displayStatus.version_info.commit && displayStatus.version_info.commit !== 'unknown' && <div className="flex justify-between"><span className="text-gray-600 dark:text-gray-400">Commit:</span><span className="text-gray-900 dark:text-gray-100 text-xs font-mono">{displayStatus.version_info.commit}</span></div>}</>}</div> : <div className="space-y-1 text-xs">{control.last_execution ? <><p className="text-gray-600 dark:text-gray-400"><span className="font-mono">ID:</span> {control.last_execution.job_id.substring(0, 8)}...</p><p className="text-gray-600 dark:text-gray-400"><span className="font-mono">Status:</span> {control.last_execution.status}</p><p className="text-gray-600 dark:text-gray-400"><span className="font-mono">Time:</span> {new Date(control.last_execution.timestamp).toLocaleTimeString()}</p></> : <p className="text-gray-500 dark:text-gray-400 italic">No jobs executed yet</p>}</div>}
          </div>
        </div>
      </div>
      <div className="mt-4 text-xs text-gray-500 dark:text-gray-400"><p className="flex items-center gap-1"><Zap className="w-3 h-3" />Control-based execution via API proxy</p></div>
      <CustomQASMModal isOpen={customQasmModal.isOpen} initialContent={customQasmContent} onSubmit={handleCustomQasmSubmit} onCancel={handleCustomQasmCancel} />
    </div>
  )
}
