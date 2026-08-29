import { useState, useEffect, useRef, useCallback } from 'react'
import { useLocalAgent } from '../../../hooks/useLocalAgent'
import { useDrillDownWebSocket } from '../../../hooks/useDrillDownWebSocket'
import { UI_FEEDBACK_TIMEOUT_MS } from '../../../lib/constants/network'
import { copyToClipboard } from '../../../lib/clipboard'

export interface UsePVCDrillDownResult {
  agentConnected: boolean
  status: string
  capacity: string
  accessModes: string[]
  storageClass: string
  volumeName: string
  volumeMode: string
  labels: Record<string, string> | null
  annotations: Record<string, string> | null
  describeOutput: string | null
  describeLoading: boolean
  yamlOutput: string | null
  yamlLoading: boolean
  copiedField: string | null
  isLoading: boolean
  error: string | null
  handleCopy: (text: string, field: string) => Promise<void>
  fetchDescribe: () => Promise<void>
  fetchYaml: () => Promise<void>
  retry: () => void
}

/**
 * Owns all remote data loading for the PVC drill-down (status, labels, describe, yaml)
 * so the view component stays presentational.
 */
export function usePVCDrillDown(
  cluster: string,
  namespace: string,
  pvcName: string,
  initialData: Record<string, unknown>
): UsePVCDrillDownResult {
  const { isConnected: agentConnected } = useLocalAgent()
  const { runKubectl } = useDrillDownWebSocket(cluster)

  const [status, setStatus] = useState<string>(initialData.status as string || '')
  const [capacity, setCapacity] = useState<string>(initialData.capacity as string || '')
  const [accessModes, setAccessModes] = useState<string[]>((initialData.accessModes as string[]) || [])
  const [storageClass, setStorageClass] = useState<string>(initialData.storageClass as string || '')
  const [volumeName, setVolumeName] = useState<string>(initialData.volumeName as string || '')
  const [volumeMode, setVolumeMode] = useState<string>('')
  const [labels, setLabels] = useState<Record<string, string> | null>(null)
  const [annotations, setAnnotations] = useState<Record<string, string> | null>(null)
  const [describeOutput, setDescribeOutput] = useState<string | null>(null)
  const [describeLoading, setDescribeLoading] = useState(false)
  const [yamlOutput, setYamlOutput] = useState<string | null>(null)
  const [yamlLoading, setYamlLoading] = useState(false)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const copiedFieldTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch PVC data from cluster
  const fetchData = useCallback(async () => {
    if (!agentConnected) return

    setIsLoading(true)
    try {
      const output = await runKubectl(['get', 'pvc', pvcName, '-n', namespace, '-o', 'json'])
      if (output) {
        let pvc
        try {
          pvc = JSON.parse(output)
        } catch {
          setLabels(null)
          setAnnotations(null)
          return
        }
        setStatus(pvc.status?.phase || '')
        setCapacity(pvc.status?.capacity?.storage || pvc.spec?.resources?.requests?.storage || '')
        setAccessModes(pvc.spec?.accessModes || [])
        setStorageClass(pvc.spec?.storageClassName || '')
        setVolumeName(pvc.spec?.volumeName || '')
        setVolumeMode(pvc.spec?.volumeMode || 'Filesystem')
        setLabels(pvc.metadata?.labels || null)
        setAnnotations(pvc.metadata?.annotations || null)
      }
      setError(null)
    } catch (err) {
      console.error('[PVCDrillDown] Failed to load PVC data', err)
      setError(err instanceof Error ? err.message : 'Failed to load PersistentVolumeClaim')
    } finally {
      setIsLoading(false)
    }
  }, [agentConnected, runKubectl, pvcName, namespace])

  const fetchedRef = useRef(false)
  useEffect(() => {
    if (!fetchedRef.current) {
      fetchedRef.current = true
      void fetchData()
    }
  }, [fetchData])

  const retry = useCallback(() => {
    setError(null)
    void fetchData()
  }, [fetchData])

  const fetchDescribe = useCallback(async () => {
    if (!agentConnected || describeLoading) return
    setDescribeLoading(true)
    try {
      const output = await runKubectl(['describe', 'pvc', pvcName, '-n', namespace])
      setDescribeOutput(output || 'No output received')
    } catch (err) {
      console.error('[PVCDrillDown] Failed to describe PVC', err)
      setError(err instanceof Error ? err.message : 'Failed to describe PersistentVolumeClaim')
    } finally {
      setDescribeLoading(false)
    }
  }, [agentConnected, describeLoading, runKubectl, pvcName, namespace])

  const fetchYaml = useCallback(async () => {
    if (!agentConnected || yamlLoading) return
    setYamlLoading(true)
    try {
      const output = await runKubectl(['get', 'pvc', pvcName, '-n', namespace, '-o', 'yaml'])
      setYamlOutput(output || 'No output received')
    } catch (err) {
      console.error('[PVCDrillDown] Failed to load PVC YAML', err)
      setError(err instanceof Error ? err.message : 'Failed to load PersistentVolumeClaim YAML')
    } finally {
      setYamlLoading(false)
    }
  }, [agentConnected, yamlLoading, runKubectl, pvcName, namespace])

  useEffect(() => {
    return () => {
      if (copiedFieldTimeoutRef.current) {
        clearTimeout(copiedFieldTimeoutRef.current)
      }
    }
  }, [])

  const handleCopy = useCallback(async (text: string, field: string) => {
    const ok = await copyToClipboard(text)
    if (ok) {
      setCopiedField(field)
      if (copiedFieldTimeoutRef.current) {
        clearTimeout(copiedFieldTimeoutRef.current)
      }
      copiedFieldTimeoutRef.current = setTimeout(() => {
        setCopiedField(null)
        copiedFieldTimeoutRef.current = null
      }, UI_FEEDBACK_TIMEOUT_MS)
    }
  }, [])

  return {
    agentConnected,
    status,
    capacity,
    accessModes,
    storageClass,
    volumeName,
    volumeMode,
    labels,
    annotations,
    describeOutput,
    describeLoading,
    yamlOutput,
    yamlLoading,
    copiedField,
    isLoading,
    error,
    handleCopy,
    fetchDescribe,
    fetchYaml,
    retry,
  }
}
