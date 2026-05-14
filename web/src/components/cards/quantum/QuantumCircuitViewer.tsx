import React from 'react'
import { useCardLoadingState } from '../CardDataContext'
import { Skeleton } from '../../ui/Skeleton'
import { isQuantumForcedToDemo } from '../../../lib/demoMode'
import { useAuth } from '../../../lib/auth'
import {
  useQuantumCircuitAscii,
  QUANTUM_CIRCUIT_DEFAULT_POLL_MS,
} from '../../../hooks/useCachedQuantum'

const CIRCUIT_ASCII_POLLING_INTERVAL_MS = QUANTUM_CIRCUIT_DEFAULT_POLL_MS

interface QuantumCircuitViewerProps {
  isDemoData?: boolean
}

export const QuantumCircuitViewer: React.FC<QuantumCircuitViewerProps> = ({ isDemoData = false }) => {
  const { isAuthenticated, login, isLoading: authIsLoading } = useAuth()
  const forceDemo = isDemoData || isQuantumForcedToDemo()
  const {
    data,
    isLoading,
    isRefreshing,
    isDemoData: isCachedDemoData,
    error,
    isFailed,
    consecutiveFailures,
  } = useQuantumCircuitAscii({
    isAuthenticated,
    forceDemo,
    pollInterval: CIRCUIT_ASCII_POLLING_INTERVAL_MS,
  })

  const circuitAscii = data?.circuitAscii ?? null
  const effectiveIsDemoData = isAuthenticated ? isCachedDemoData : false
  const { showSkeleton } = useCardLoadingState({
    isLoading: isLoading && circuitAscii === null,
    hasAnyData: circuitAscii !== null,
    isFailed,
    consecutiveFailures,
    isDemoData: effectiveIsDemoData,
    isRefreshing,
  })

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

  if (showSkeleton) {
    return (
      <div className="p-4">
        <Skeleton variant="text" width="80%" height={24} />
      </div>
    )
  }

  return (
    <div className="p-4">
        {circuitAscii ? (
          <div className="overflow-x-auto bg-card rounded border border-border">
            <pre className="p-4 m-0 whitespace-pre text-foreground quantum-circuit-display" style={{ minWidth: 'fit-content' }}>
              {circuitAscii}
            </pre>
          </div>
        ) : (
          <div className="text-center text-muted-foreground">
            <p>{error ?? 'Unable to load quantum circuit diagram'}</p>
          </div>
        )}
    </div>
  )
}