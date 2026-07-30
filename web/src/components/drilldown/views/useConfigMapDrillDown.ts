import { useState, useEffect, useRef, useCallback } from 'react'
import { useLocalAgent } from '../../../hooks/useLocalAgent'
import { useDrillDownWebSocket } from '../../../hooks/useDrillDownWebSocket'
import { UI_FEEDBACK_TIMEOUT_MS } from '../../../lib/constants/network'
import { copyToClipboard } from '../../../lib/clipboard'
import { useTranslation } from 'react-i18next'

export interface UseConfigMapDrillDownResult {
  agentConnected: boolean
  configmapData: Record<string, string> | null
  dataLoading: boolean
  dataError: string | null
  labels: Record<string, string> | null
  describeOutput: string | null
  describeLoading: boolean
  yamlOutput: string | null
  yamlLoading: boolean
  copiedField: string | null
  showAllData: boolean
  revealedKeys: Set<string>
  revealAll: boolean
  setShowAllData: (val: boolean) => void
  toggleRevealAll: () => void
  toggleReveal: (key: string) => void
  isRevealed: (key: string) => boolean
  handleCopy: (field: string, value: string) => void
}

export function useConfigMapDrillDown(
  cluster: string,
  namespace: string,
  configmapName: string,
  hasRequiredContext: boolean,
): UseConfigMapDrillDownResult {
  const { t } = useTranslation()
  const { isConnected: agentConnected } = useLocalAgent()
  const { runKubectl } = useDrillDownWebSocket(cluster)

  const [configmapData, setConfigmapData] = useState<Record<string, string> | null>(null)
  const [describeOutput, setDescribeOutput] = useState<string | null>(null)
  const [describeLoading, setDescribeLoading] = useState(false)
  const [yamlOutput, setYamlOutput] = useState<string | null>(null)
  const [yamlLoading, setYamlLoading] = useState(false)
  const [dataLoading, setDataLoading] = useState(false)
  const [dataError, setDataError] = useState<string | null>(null)
  const [labels, setLabels] = useState<Record<string, string> | null>(null)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const copiedFieldTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [showAllData, setShowAllData] = useState(false)
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set())
  const [revealAll, setRevealAll] = useState(false)
  const hasLoadedRef = useRef(false)

  const fetchData = useCallback(async () => {
    if (!agentConnected || !hasRequiredContext) return
    setDataLoading(true)
    setDataError(null)
    try {
      const output = await runKubectl(['get', 'configmap', configmapName, '-n', namespace, '-o', 'json'])
      if (output) {
        let cm
        try {
          cm = JSON.parse(output)
        } catch {
          setConfigmapData({})
          setLabels({})
          return
        }
        setConfigmapData(cm.data || {})
        setLabels(cm.metadata?.labels || {})
      }
    } catch (err) {
      setDataError(err instanceof Error ? err.message : t('common.fetchFailed', 'Failed to load ConfigMap data'))
    } finally {
      setDataLoading(false)
    }
  }, [agentConnected, hasRequiredContext, runKubectl, configmapName, namespace, t])

  const fetchDescribe = useCallback(async () => {
    if (!agentConnected || !hasRequiredContext || describeOutput) return
    setDescribeLoading(true)
    try {
      const output = await runKubectl(['describe', 'configmap', configmapName, '-n', namespace])
      setDescribeOutput(output)
    } finally {
      setDescribeLoading(false)
    }
  }, [agentConnected, hasRequiredContext, describeOutput, runKubectl, configmapName, namespace])

  const fetchYaml = useCallback(async () => {
    if (!agentConnected || !hasRequiredContext || yamlOutput) return
    setYamlLoading(true)
    try {
      const output = await runKubectl(['get', 'configmap', configmapName, '-n', namespace, '-o', 'yaml'])
      setYamlOutput(output)
    } finally {
      setYamlLoading(false)
    }
  }, [agentConnected, hasRequiredContext, yamlOutput, runKubectl, configmapName, namespace])

  // Pre-fetch tab data when agent connects. Batched to limit concurrent WebSocket connections.
  useEffect(() => {
    if (!hasRequiredContext) {
      setConfigmapData({})
      setLabels({})
      setDescribeOutput(null)
      setYamlOutput(null)
      setDescribeLoading(false)
      setYamlLoading(false)
      return
    }
    if (!agentConnected || hasLoadedRef.current) return
    hasLoadedRef.current = true

    const loadData = async () => {
      // Batch 1: Overview data (2 concurrent)
      await Promise.all([fetchData(), fetchDescribe()])
      // Batch 2: YAML (lower priority)
      await fetchYaml()
    }
    loadData()
  }, [agentConnected, fetchData, fetchDescribe, fetchYaml, hasRequiredContext])

  useEffect(() => {
    return () => {
      if (copiedFieldTimeoutRef.current) {
        clearTimeout(copiedFieldTimeoutRef.current)
      }
    }
  }, [])

  const handleCopy = (field: string, value: string) => {
    copyToClipboard(value)
    setCopiedField(field)
    if (copiedFieldTimeoutRef.current) {
      clearTimeout(copiedFieldTimeoutRef.current)
    }
    copiedFieldTimeoutRef.current = setTimeout(() => {
      setCopiedField(null)
      copiedFieldTimeoutRef.current = null
    }, UI_FEEDBACK_TIMEOUT_MS)
  }

  const toggleReveal = (key: string) => {
    setRevealedKeys(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const toggleRevealAll = () => setRevealAll(v => !v)

  const isRevealed = (key: string) => revealAll || revealedKeys.has(key)

  return {
    agentConnected,
    configmapData,
    dataLoading,
    dataError,
    labels,
    describeOutput,
    describeLoading,
    yamlOutput,
    yamlLoading,
    copiedField,
    showAllData,
    revealedKeys,
    revealAll,
    setShowAllData,
    toggleRevealAll,
    toggleReveal,
    isRevealed,
    handleCopy,
  }
}
