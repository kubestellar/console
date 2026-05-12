import { useState, useEffect } from 'react'
import { useAuth } from '../lib/auth'
import { isQuantumForcedToDemo } from '../lib/demoMode'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../lib/constants/network'

interface QASMFile {
  name: string
  size?: number
}

interface UseQASMFilesResult {
  files: QASMFile[]
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
}

export function useQASMFiles(enabled?: boolean, forceDemo?: boolean): UseQASMFilesResult {
  const { isAuthenticated } = useAuth()
  const [files, setFiles] = useState<QASMFile[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Determine demo mode: prefer explicit forceDemo, otherwise use workload detection
  const workloadIsDemoMode = isQuantumForcedToDemo()
  const isDemoMode = forceDemo ?? workloadIsDemoMode

  const fetchFiles = async () => {
    try {
      setIsLoading(true)
      setError(null)

      const response = await fetch('/api/quantum/qasm/listfiles', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch QASM files (${response.status})`)
      }

      const data = await response.json()
      const fileList: QASMFile[] = Array.isArray(data) ? data : data.files || []
      setFiles(fileList)
    } catch (err) {
      console.error('Error fetching QASM files:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch QASM files')
      setFiles([])
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    // Skip fetch if explicitly disabled or user is not authenticated
    if (enabled === false || !isAuthenticated) {
      setIsLoading(false)
      return
    }

    if (isDemoMode) {
      // In demo mode, show only bell.qasm
      setFiles([{ name: 'bell.qasm' }])
      setIsLoading(false)
      return
    }

    fetchFiles()
  }, [isAuthenticated, enabled, isDemoMode, forceDemo, workloadIsDemoMode])

  return { files, isLoading, error, refetch: fetchFiles }
}
