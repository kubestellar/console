import React, { useState, useEffect, useMemo } from 'react'
import DOMPurify from 'dompurify'
import { AlertCircle, RefreshCw, Lock, Unlock } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useReportCardDataState } from '../CardDataContext'
import { isQuantumForcedToDemo } from '../../../lib/demoMode'
import { useAuth } from '../../../lib/auth'
import { notifyPatternChange } from '../../../lib/quantum/patternChangeEmitter'
import { useQuantumQubitGridData } from '../../../hooks/useCachedQuantum'
import {
  IDLE_QUBIT_STYLE,
  QUBIT_GRID_DEFAULT_POLL_MS,
  DEMO_DATA,
  QUBIT_DISPLAY_PATTERNS,
  MASK_OPTIONS,
  renderQubitSVG,
} from './QuantumQubitGrid.utils'
import type { MaskKey } from './QuantumQubitGrid.utils'

export const QuantumQubitGrid: React.FC = () => {
  const { t } = useTranslation(['cards'])
  const { isAuthenticated, login, isLoading: authIsLoading } = useAuth()
  const [refreshInterval, setRefreshInterval] = useState(QUBIT_GRID_DEFAULT_POLL_MS)
  const [selectedMask, setSelectedMask] = useState<MaskKey>('ibm_qx5')
  const [maskLocked, setMaskLocked] = useState(false)
  const forceDemo = isQuantumForcedToDemo()
  const {
    data,
    isLoading,
    isRefreshing,
    isDemoData,
    error,
    isFailed,
    consecutiveFailures,
  } = useQuantumQubitGridData({
    isAuthenticated,
    forceDemo,
    pollInterval: refreshInterval,
  })

  const qubitData = data?.qubits ?? null
  const versionInfo = data?.versionInfo ?? null
  const shouldShowEmpty = qubitData === null

  useReportCardDataState({
    isLoading: isAuthenticated ? isLoading && qubitData === null : false,
    isRefreshing,
    isDemoData: isAuthenticated ? isDemoData : false,
    hasData: isAuthenticated ? qubitData !== null || shouldShowEmpty : false,
    isFailed,
    consecutiveFailures,
  })

  const displayData = shouldShowEmpty ? { num_qubits: 8, pattern: '' } : (qubitData || DEMO_DATA)

  // Mask selection policy:
  //   - Unlocked: always auto-pick the smallest mask that fits the current
  //     qubit count, on every poll. Manual upsizing only sticks while the
  //     mask is locked — that's what the lock is for.
  //   - Locked: keep the user's choice. EXCEPTION: if the new qubit count
  //     exceeds the locked mask's capacity, auto-release the lock and pick
  //     the next-larger mask so qubits aren't silently truncated.
  //   - If the qubit count exceeds even the largest mask in MASK_OPTIONS,
  //     fall back to the largest available mask. This prevents leaving a
  //     stale (smaller) selectedMask which would silently truncate; the
  //     "(too small)" option label communicates the overflow to the user.
  useEffect(() => {
    if (!qubitData) return

    if (maskLocked) {
      const current = MASK_OPTIONS.find(m => m.key === selectedMask)
      if (current && qubitData.num_qubits <= current.maxQubits) return
      setMaskLocked(false)
    }

    const best = MASK_OPTIONS.find(m => m.maxQubits >= qubitData.num_qubits)
    if (best) {
      setSelectedMask(best.key)
      return
    }

    // No mask fits — pick the largest as the least-truncating fallback.
    const largest = MASK_OPTIONS.reduce((a, b) => (b.maxQubits > a.maxQubits ? b : a))
    if (largest && largest.key !== selectedMask) {
      setSelectedMask(largest.key)
    }
  }, [qubitData, maskLocked, selectedMask])

  // Emit pattern changes to trigger histogram refresh.
  // This includes empty patterns (cleared results, reset circuit, or fetch errors)
  // so the histogram can react to all quantum state transitions, not just successful runs.
  useEffect(() => {
    // Always notify, even when qubitData is null (representing cleared/reset state)
    const pattern = qubitData?.pattern ?? ''
    notifyPatternChange(pattern)
  }, [qubitData])

  const svgContent = useMemo(() => {
    return renderQubitSVG(displayData.pattern, QUBIT_DISPLAY_PATTERNS[selectedMask])
  }, [displayData.pattern, selectedMask])

  // Get the label for the currently selected mask
  const patternLabel = useMemo(() => {
    return MASK_OPTIONS.find(m => m.key === selectedMask)?.label ?? selectedMask
  }, [selectedMask])

  if (authIsLoading) {
    return (
      <div className="p-4 space-y-3">
        <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-40" />
        <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center p-8 gap-4 text-center">
        <p className="text-muted-foreground">Please log in to view quantum data</p>
        <button
          onClick={() => login()}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
        >
          Continue with GitHub
        </button>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto p-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Quantum Qubit Display -- Latest Run
            {isRefreshing && (
              <span className="ml-2 inline-block animate-spin">
                <RefreshCw size={16} className="inline" />
              </span>
            )}
          </h3>
          {isDemoData && (
            <span className="inline-block px-2 py-1 text-xs font-semibold bg-yellow-200 dark:bg-yellow-900 text-yellow-900 dark:text-yellow-200 rounded">
              Demo Mode
            </span>
          )}
        </div>

        {/* Error message */}
        {error && !isDemoData && (
          <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300 flex items-start gap-2">
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* SVG Grid */}
        <div className="flex justify-center p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
          <div
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(svgContent, { USE_PROFILES: { svg: true, svgFilters: true } }) }}
            style={{ filter: isDemoData ? 'brightness(0.9)' : 'none' }}
          />
        </div>

        {/* Display Mask Selector */}
        <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 space-y-2">
          <label htmlFor="quantum-qubit-grid-mask-select" className="text-xs font-semibold text-gray-600 dark:text-gray-400">
            {t('cards:quantumQubitGrid.displayMask')}
          </label>
          <div className="flex items-center gap-2">
            <select
              id="quantum-qubit-grid-mask-select"
              value={selectedMask}
              onChange={e => setSelectedMask(e.target.value as MaskKey)}
              disabled={maskLocked}
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {MASK_OPTIONS.map(opt => (
                <option
                  key={opt.key}
                  value={opt.key}
                  disabled={displayData.num_qubits > opt.maxQubits}
                >
                  {opt.label}{displayData.num_qubits > opt.maxQubits ? ' (too small)' : ''}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setMaskLocked(prev => !prev)}
              aria-label={maskLocked ? t('cards:quantumQubitGrid.unlockMask') : t('cards:quantumQubitGrid.lockMask')}
              aria-pressed={maskLocked}
              title={maskLocked ? t('cards:quantumQubitGrid.unlockMask') : t('cards:quantumQubitGrid.lockMask')}
              className="shrink-0 p-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-150"
            >
              {maskLocked
                ? <Lock className="w-4 h-4" aria-hidden="true" />
                : <Unlock className="w-4 h-4" aria-hidden="true" />
              }
            </button>
          </div>
        </div>

        {/* Legend */}
        <div className="grid grid-cols-4 gap-3 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-blue-500 rounded border border-border" />
            <span className="text-gray-600 dark:text-gray-400">|0⟩ State</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-red-500 rounded border border-border" />
            <span className="text-gray-600 dark:text-gray-400">|1⟩ State</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded border-2 border-gray-500 flex-shrink-0" style={IDLE_QUBIT_STYLE} />
            <span className="text-gray-600 dark:text-gray-400">Unused/Unmeasured</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-black rounded border-2 border-gray-400 flex-shrink-0" />
            <span className="text-gray-600 dark:text-gray-400">BKGD</span>
          </div>
        </div>

        {/* Info box */}
        <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-xs space-y-1">
          <p>
            <span className="font-semibold">Qubits:</span> <span className="font-mono">{displayData.num_qubits}</span>
          </p>
          <p>
            <span className="font-semibold">Pattern:</span> <span className="font-mono">{displayData.pattern}</span>
          </p>
          <p>
            <span className="font-semibold">Display:</span> <span className="font-mono">{patternLabel}</span>
          </p>
          {versionInfo && (
            <>
              <div className="border-t border-blue-300 dark:border-blue-700 pt-1 mt-1" />
              <p>
                <span className="font-semibold">Backend Ver:</span> <span className="font-mono">{versionInfo.version}</span>
              </p>
              {versionInfo.commit && versionInfo.commit !== 'unknown' && (
                <p>
                  <span className="font-semibold">Commit:</span> <span className="font-mono text-gray-600 dark:text-gray-400">{versionInfo.commit}</span>
                </p>
              )}
            </>
          )}
        </div>

        {/* Refresh interval slider */}
        <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 space-y-2">
          <label className="text-xs font-semibold text-gray-600 dark:text-gray-400">
            Refresh: {(refreshInterval / 1000).toFixed(1)}s
          </label>
          <input
            type="range"
            min="1000"
            max="10000"
            step="500"
            value={refreshInterval}
            onChange={e => setRefreshInterval(Number(e.target.value))}
            className="w-full"
          />
        </div>

        {/* Status */}
        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
          <span>{isLoading ? '⏳ Loading...' : isRefreshing ? '🔄 Updating...' : '✓ Ready'}</span>
          {consecutiveFailures > 0 && <span>Failures: {consecutiveFailures}/3</span>}
        </div>
      </div>
    )
  }