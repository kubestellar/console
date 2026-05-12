import React, { useEffect, useState } from 'react'
import { useCardLoadingState } from '../CardDataContext'
import { Skeleton } from '../../ui/Skeleton'
import { isGlobalQuantumPollingPaused } from '../../../lib/quantum/pollingContext'
import { isQuantumForcedToDemo } from '../../../lib/demoMode'
import { useAuth } from '../../../lib/auth'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../../../lib/constants/network'

const CIRCUIT_ASCII_POLLING_INTERVAL_MS = 10000

const DEMO_CIRCUIT_ASCII = `     ┌───┐     ┌─┐
q_0: ┤ H ├──■──┤M├───
     └───┘┌─┴─┐└╥┘┌─┐
q_1: ─────┤ X ├─╫─┤M├
          └───┘ ║ └╥┘
c: 2/═══════════╩══╩═
                0  1

File: bell.qasm | Bell State Preparation
Shots: 1024 | Backend: aer`

interface QuantumCircuitViewerProps {
  isDemoData?: boolean
}

export const QuantumCircuitViewer: React.FC<QuantumCircuitViewerProps> = ({ isDemoData = false }) => {
  const { isAuthenticated, login, isLoading: authIsLoading } = useAuth()
  const [circuitAscii, setCircuitAscii] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isFailed, setIsFailed] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (authIsLoading) {
    return (
      <div className="p-4">
        <Skeleton variant="text" width="80%" height={24} />
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

  const effectiveIsDemoData = isDemoData || isQuantumForcedToDemo()
  const { showSkeleton } = useCardLoadingState({
    isLoading: isLoading && circuitAscii === null,
    hasAnyData: circuitAscii !== null,
    isFailed,
    consecutiveFailures: isFailed ? 1 : 0,
    isDemoData: effectiveIsDemoData,
    isRefreshing: false,
  })

  useEffect(() => {
    const fetchCircuit = async () => {
      // Show demo circuit if forced to demo mode
      if (isQuantumForcedToDemo()) {
        setCircuitAscii(DEMO_CIRCUIT_ASCII)
        setError(null)
        setIsFailed(false)
        setIsLoading(false)
        return
      }

      // Skip fetch if polling is paused
      if (isGlobalQuantumPollingPaused()) {
        setIsLoading(false)
        return
      }

      try {
        setIsLoading(true)
        setIsFailed(false)
        const response = await fetch('/api/quantum/qasm/circuit/ascii', {
          signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
        })
        if (!response.ok) {
          throw new Error(`Failed to fetch circuit: ${response.statusText}`)
        }
        const html = await response.text()
        const preMatch = html.match(/<pre>([\s\S]*?)<\/pre>/)
        if (!preMatch) {
          throw new Error('No circuit data found in response')
        }
        setCircuitAscii(preMatch[1].trimEnd())
        setError(null)
      } catch (error) {
        console.error('Error fetching quantum circuit:', error)
        setError(error instanceof Error ? error.message : 'Unable to load quantum circuit diagram')
        setIsFailed(true)
      } finally {
        setIsLoading(false)
      }
    }

    fetchCircuit()
    const interval = setInterval(fetchCircuit, CIRCUIT_ASCII_POLLING_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [isAuthenticated])

  if (showSkeleton) {
    return (
      <div className="p-4">
        <Skeleton variant="text" width="80%" height={24} />
      </div>
    )
  }

  return (
    <div className="p-4">
      {effectiveIsDemoData && (
        <div className="mb-3 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg text-sm text-blue-600 dark:text-blue-400">
          Quantum backend not available. Displaying demo data.
        </div>
      )}
      {circuitAscii ? (
        <div className="overflow-x-auto bg-card rounded border border-border">
          <pre className="p-4 m-0 whitespace-pre text-foreground quantum-circuit-display" style={{ minWidth: 'fit-content' }}>
            {circuitAscii}
          </pre>
        </div>
      ) : !effectiveIsDemoData && (
        <div className="text-center text-muted-foreground">
          <p>{error ?? 'Unable to load quantum circuit diagram'}</p>
        </div>
      )}
    </div>
  )
}