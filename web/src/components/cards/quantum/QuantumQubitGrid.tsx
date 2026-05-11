import React, { useState, useEffect, useMemo } from 'react'
import DOMPurify from 'dompurify'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useReportCardDataState } from '../CardDataContext'
import { isGlobalQuantumPollingPaused } from '../../../lib/quantum/pollingContext'
import { isQuantumForcedToDemo } from '../../../lib/demoMode'
import { useAuth } from '../../../lib/auth'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../../../lib/constants/network'

// Polling interval for qubit grid updates (adjustable for responsiveness)
const QUBIT_GRID_DEFAULT_POLL_MS = 10000
// SVG border color for qubit grid display
const SVG_BORDER_COLOR = '#ccc'

interface QubitSimpleData {
  num_qubits: number
  pattern: string
}

const DEMO_DATA: QubitSimpleData = {
  num_qubits: 8,
  pattern: '01010101',
}

// Qubit pixel coordinate mappings from QuantumKCDemo.v0_2.py
const QUBIT_DISPLAY_PATTERNS = {
  ibm_qx5: [
    [40, 41, 48, 49],
    [8, 9, 16, 17],
    [28, 29, 36, 37],
    [6, 7, 14, 15],
    [54, 55, 62, 63],
  ],
  ibm_qx5t: [
    [0, 1, 8, 9],
    [3, 4, 11, 12],
    [6, 7, 14, 15],
    [27, 28, 35, 36],
    [51, 52, 59, 60],
  ],
  ibm_qhex: [
    [3],
    [10], [12],
    [17], [21],
    [24], [30],
    [33], [37],
    [42], [44],
    [51]
  ],
  ibm_q16x: [
    [63], [54], [61], [52],
    [59], [50], [57], [48],
    [7], [14], [5], [12],
    [3], [10], [1], [8]
  ],
  ibm_q32x: [
    [0], [2], [4], [6],
    [9], [11], [13], [15],
    [16], [18], [20], [22],
    [25], [27], [29], [31],
    [32], [34], [36], [38],
    [41], [43], [45], [47],
    [48], [50], [52], [54],
    [57], [59], [61], [63]
  ],
  qk_logo: [
    [2], [3], [4], [5],
    [9], [10], [13], [14],
    [16], [18], [21], [23],
    [24], [27], [28], [31],
    [32], [33], [38], [39],
    [40], [42], [43], [44], [45], [47],
    [49], [54],
    [58], [59], [60], [61]
  ]
} as const

const MASK_OPTIONS = [
  { key: 'ibm_qx5t' as const, label: 'IBM QX5 Tee (5-qubit)', maxQubits: 5 },
  { key: 'ibm_qx5' as const, label: 'IBM QX5 Bowtie (5-qubit)', maxQubits: 5 },
  { key: 'ibm_qhex' as const, label: 'IBM QHex (12-qubit)', maxQubits: 12 },
  { key: 'ibm_q16x' as const, label: 'IBM Q16x (16-qubit)', maxQubits: 16 },
  { key: 'ibm_q32x' as const, label: 'IBM Q32x (32-qubit)', maxQubits: 32 },
]

type MaskKey = typeof MASK_OPTIONS[number]['key']

// Map qubit state to RGB: 0=Blue, 1=Red, 2=Purple (indeterminate/unused), 3=Black (background)
function qubitStateToColor(state: number): [number, number, number] {
  switch (state) {
    case 1: return [255, 0, 0]      // Red for |1⟩
    case 0: return [0, 0, 255]      // Blue for |0⟩
    case 2: return [104,97,104]
    //case 2: return [128, 0, 128]    // Purple for indeterminate/unused qubits
    case 3: return [0, 0, 0]        // Black for background pixels
    default: return [0, 0, 0]       // Black (fallback)
  }
}

// Render 8x8 SVG grid with proper qubit pattern mapping
function renderQubitSVG(pattern: string, displayPattern: readonly (readonly number[])[]): string {
  const gridSize = 64
  const rectSize = 16
  const padding = 1

  // If no data available, show Qiskit logo in "unused" color (state 2)
  if (!pattern || pattern.length === 0) {
    const pixelStates = new Array(gridSize).fill(3) // 3 = black (background)
    const logoPattern = QUBIT_DISPLAY_PATTERNS.qk_logo as unknown as (readonly number[])[]

    // Mark logo pixels as state 2 (unused/purple)
    for (const pixelIndices of logoPattern) {
      for (const pixelIndex of pixelIndices) {
        if (pixelIndex < gridSize) {
          pixelStates[pixelIndex] = 2
        }
      }
    }

    let svg = `<svg width="128" height="128" version="1.1" xmlns="http://www.w3.org/2000/svg" style="border: 1px solid ${SVG_BORDER_COLOR}; border-radius: 4px;">\n`

    for (let i = 0; i < gridSize; i++) {
      const x = rectSize * (i % 8)
      const y = rectSize * Math.floor(i / 8)
      const [r, g, b] = qubitStateToColor(pixelStates[i])
      svg += `  <rect x="${x}" y="${y}" width="${rectSize}" height="${rectSize}" fill="rgb(${r},${g},${b})" stroke="white" stroke-width="${padding}"/>\n`
    }

    svg += '</svg>'
    return svg
  }

  // Initialize all pixels as black (state 3 = background pixels)
  const pixelStates = new Array(gridSize).fill(3)

  // First pass: Mark all template pixels as indeterminate/purple (state 2)
  for (const pixelCoords of displayPattern) {
    for (const pixelIndex of pixelCoords) {
      if (pixelIndex < gridSize) {
        pixelStates[pixelIndex] = 2 // 2 = purple (indeterminate/unused)
      }
    }
  }

  // Second pass: Overlay actual qubit data (0 or 1)
  for (let q = 0; q < displayPattern.length && q < pattern.length; q++) {
    const qubitState = pattern[q] === '1' ? 1 : 0
    for (const pixelIndex of displayPattern[q]) {
      if (pixelIndex < gridSize) {
        pixelStates[pixelIndex] = qubitState
      }
    }
  }

  let svg = `<svg width="128" height="128" version="1.1" xmlns="http://www.w3.org/2000/svg" style="border: 1px solid var(--border); border-radius: 4px;">\n`

  for (let i = 0; i < gridSize; i++) {
    const x = rectSize * (i % 8)
    const y = rectSize * Math.floor(i / 8)
    const [r, g, b] = qubitStateToColor(pixelStates[i])
    svg += `  <rect x="${x}" y="${y}" width="${rectSize}" height="${rectSize}" fill="rgb(${r},${g},${b})" stroke="white" stroke-width="${padding}"/>\n`
  }

  svg += '</svg>'
  return svg
}

export const QuantumQubitGrid: React.FC = () => {
  const { t } = useTranslation(['cards', 'errors'])
  const { isAuthenticated, login, isLoading: authIsLoading } = useAuth()
  const [data, setData] = useState<QubitSimpleData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)
  const [refreshInterval, setRefreshInterval] = useState(QUBIT_GRID_DEFAULT_POLL_MS)
  const [selectedMask, setSelectedMask] = useState<MaskKey>('ibm_qx5')
  const [versionInfo, setVersionInfo] = useState<{ version: string; commit: string; timestamp: string } | null>(null)

  

  const isDemoFallback = consecutiveFailures >= 3
  // Show empty grid if no data AND (executing or loop_mode is active)
  const shouldShowEmpty = data === null  // Always show empty grid when no data

  useReportCardDataState({
    isLoading: isLoading && !isDemoFallback,
    isRefreshing,
    isDemoData: isDemoFallback,
    hasData: data !== null || shouldShowEmpty,  // Show grid even when empty
    isFailed: error !== null,
    consecutiveFailures,
  })

  const displayData = shouldShowEmpty ? { num_qubits: 8, pattern: '' } : (data || DEMO_DATA)

  // Auto-select smallest valid mask for current qubit count
  useEffect(() => {
    if (data) {
      const best = MASK_OPTIONS.find(m => m.maxQubits >= data.num_qubits)
      if (best) {
        setSelectedMask(best.key)
      }
    }
  }, [data?.num_qubits])

  const svgContent = useMemo(() => {
    return renderQubitSVG(displayData.pattern, QUBIT_DISPLAY_PATTERNS[selectedMask])
  }, [displayData.pattern, selectedMask])

  // Fetch qubit data and execution status
  useEffect(() => {
    const fetchQubits = async () => {
      try {
        setIsRefreshing(true)
        const res = await fetch('/api/quantum/qubits/simple', {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
        })

        if (!res.ok) {
          const errorBody = await res.text()
          const fetchError = t('quantumQubitGrid.fetchFailed', {
            defaultValue: 'Unable to load quantum qubit data',
          })
          console.error('[QuantumQubitGrid] Request failed:', {
            status: res.status,
            statusText: res.statusText,
            body: errorBody,
          })
          setError(fetchError)
          throw new Error(fetchError)
        }

        const result = await res.json()
        if (result.error) {
          setData(null)  // Set to null to trigger empty grid display
          setError(null)
        } else {
          setData(result)
          setError(null)
        }

        // Fetch execution status (to know if we should show empty grid)
        try {
          const statusRes = await fetch('/api/quantum/status', {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
          })

          if (statusRes.ok) {
            const statusData = await statusRes.json()
            if (statusData.version_info) {
              setVersionInfo(statusData.version_info)
            }
          }
        } catch (err) {
          // Status fetch is optional, don't fail if it doesn't work
          console.debug('Could not fetch execution status:', err)
        }

        setConsecutiveFailures(0)
      } catch (err) {
        console.error('Error fetching qubits:', err)
        console.debug('[QuantumQubitGrid] Auth Debug:', {
          hasCredentials: true,
          url: '/api/quantum/qubits/simple',
          error: err instanceof Error ? err.message : String(err),
          isOnline: navigator.onLine,
        })
        setError(
          err instanceof Error
            ? err.message
            : t('messages.unknownError', { ns: 'errors', defaultValue: 'Unknown error' })
        )
        setConsecutiveFailures(prev => prev + 1)
      } finally {
        setIsLoading(false)
        setIsRefreshing(false)
      }
    }

    fetchQubits()
    const interval = setInterval(() => {
      // Skip polling if paused (e.g., dashboard settings modal open) or demo forced
      if (!isGlobalQuantumPollingPaused() && !isQuantumForcedToDemo()) {
        fetchQubits()
      }
    }, refreshInterval)
    return () => clearInterval(interval)
  }, [refreshInterval, t])

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
        <p className="text-gray-500">Please log in to view quantum data</p>
        <button
          onClick={login}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
        >
          Continue with GitHub
        </button>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4">
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
          {isDemoFallback && (
            <span className="inline-block px-2 py-1 text-xs font-semibold bg-yellow-200 dark:bg-yellow-900 text-yellow-900 dark:text-yellow-200 rounded">
              Demo Mode
            </span>
          )}
        </div>

        {/* Error message */}
        {error && !isDemoFallback && (
          <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300 flex items-start gap-2">
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* SVG Grid */}
        <div className="flex justify-center p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
          <div
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(svgContent, { USE_PROFILES: { svg: true, svgFilters: true } }) }}
            style={{ filter: isDemoFallback ? 'brightness(0.9)' : 'none' }}
          />
        </div>

        {/* Display Mask Selector */}
        <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 space-y-2">
          <label className="text-xs font-semibold text-gray-600 dark:text-gray-400">
            Display Mask
          </label>
          <select
            value={selectedMask}
            onChange={e => setSelectedMask(e.target.value as MaskKey)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
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
        </div>

        {/* Legend */}
        <div className="grid grid-cols-4 gap-3 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-blue-500 rounded border border-gray-300" />
            <span className="text-gray-600 dark:text-gray-400">|0⟩ State</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-red-500 rounded border border-gray-300" />
            <span className="text-gray-600 dark:text-gray-400">|1⟩ State</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded border border-gray-300" style={{ backgroundColor: 'rgb(104, 97, 104)' }} />
            <span className="text-gray-600 dark:text-gray-400">Unused/Unmeasured</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-black rounded border border-gray-300" />
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