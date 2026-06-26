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

function normalizeFileList(data: unknown): QASMFile[] {
  if (Array.isArray(data)) return data as QASMFile[]
  if (data && typeof data === 'object' && 'files' in data) {
    const files = (data as { files?: unknown }).files
    return Array.isArray(files) ? (files as QASMFile[]) : []
  }
  return []
}

function extractErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Failed to fetch QASM files'
}

export const __testables = { normalizeFileList, extractErrorMessage }

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
      setFiles(normalizeFileList(data))
    } catch (err) {
      console.error('Error fetching QASM files:', err)
      setError(extractErrorMessage(err))
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
