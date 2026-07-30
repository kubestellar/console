import { useState, useEffect, useRef } from 'react'
import { Info, FileText, Code, Lock } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useLocalAgent } from '../../../hooks/useLocalAgent'
import { useDrillDownWebSocket } from '../../../hooks/useDrillDownWebSocket'
import { useDrillDownActions, useDrillDown } from '../../../hooks/useDrillDown'
import { UI_FEEDBACK_TIMEOUT_MS } from '../../../lib/constants/network'
import { copyToClipboard } from '../../../lib/clipboard'

/** Property names that must never be used as object keys (prototype pollution prevention). */
const UNSAFE_PROP_NAMES = new Set(['__proto__', 'constructor', 'prototype'])

export type TabType = 'overview' | 'data' | 'describe' | 'yaml'

export interface SecretTab {
  id: TabType
  label: string
  icon: typeof Info
}

export interface UseSecretDrillDownResult {
  cluster: string
  namespace: string
  secretName: string
  drillToNamespace: (cluster: string, namespace: string) => void
  drillToCluster: (cluster: string) => void
  stackLength: number
  pop: () => void
  activeTab: TabType
  setActiveTab: (tab: TabType) => void
  secretData: Record<string, string> | null
  secretType: string | null
  describeOutput: string | null
  describeLoading: boolean
  yamlOutput: string | null
  yamlLoading: boolean
  dataLoading: boolean
  dataError: string | null
  labels: Record<string, string> | null
  copiedField: string | null
  showAllData: boolean
  setShowAllData: (v: boolean) => void
  revealedKeys: Set<string>
  yamlRevealed: boolean
  toggleYamlRevealed: () => void
  handleCopy: (field: string, value: string) => void
  toggleReveal: (key: string) => void
  tabs: SecretTab[]
  dataEntries: [string, string][]
  displayedData: [string, string][]
}

/**
 * Owns all state and data fetching for the Secret drill-down view
 * so the view component stays presentational.
 */
export function useSecretDrillDown(data: Record<string, unknown>): UseSecretDrillDownResult {
  const { t } = useTranslation()
  const cluster = data.cluster as string
  const namespace = data.namespace as string
  const secretName = data.secret as string
  const { isConnected: agentConnected } = useLocalAgent()
  const { drillToNamespace, drillToCluster } = useDrillDownActions()
  const { state, pop } = useDrillDown()
  const { runKubectl } = useDrillDownWebSocket(cluster)

  const [activeTab, setActiveTab] = useState<TabType>('overview')
  const [secretData, setSecretData] = useState<Record<string, string> | null>(null)
  const [secretType, setSecretType] = useState<string | null>(null)
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
  const [yamlRevealed, setYamlRevealed] = useState(false)

  const fetchData = async () => {
    if (!agentConnected) return
    setDataLoading(true)
    setDataError(null)
    try {
      const output = await runKubectl(['get', 'secret', secretName, '-n', namespace, '-o', 'json'])
      if (output) {
        const secret = JSON.parse(output)
        // Decode base64 data (use null-prototype object to prevent prototype pollution)
        const decodedData: Record<string, string> = Object.create(null) as Record<string, string>
        if (secret.data) {
          for (const [key, value] of Object.entries(secret.data)) {
            if (UNSAFE_PROP_NAMES.has(key)) continue
            try {
              decodedData[key] = atob(value as string)
            } catch {
              decodedData[key] = value as string
            }
          }
        }
        setSecretData(decodedData)
        setSecretType(secret.type || 'Opaque')
        setLabels(secret.metadata?.labels || {})
      }
    } catch (err) {
      setDataError(err instanceof Error ? err.message : t('common.fetchFailed', 'Failed to load Secret data'))
    } finally {
      setDataLoading(false)
    }
  }

  const fetchDescribe = async () => {
    if (!agentConnected || describeOutput) return
    setDescribeLoading(true)
    const output = await runKubectl(['describe', 'secret', secretName, '-n', namespace])
    setDescribeOutput(output)
    setDescribeLoading(false)
  }

  const fetchYaml = async () => {
    if (!agentConnected || yamlOutput) return
    setYamlLoading(true)
    const output = await runKubectl(['get', 'secret', secretName, '-n', namespace, '-o', 'yaml'])
    setYamlOutput(output)
    setYamlLoading(false)
  }

  // Track if we've already loaded data to prevent refetching
  const hasLoadedRef = useRef(false)

  // Pre-fetch tab data when agent connects
  // Batched to limit concurrent WebSocket connections (max 2 at a time)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!agentConnected || hasLoadedRef.current) return
    hasLoadedRef.current = true
    const loadData = async () => {
      // Batch 1: Overview data (2 concurrent)
      await Promise.all([fetchData(), fetchDescribe()])
      // Batch 2: YAML (lower priority)
      await fetchYaml()
    }
    loadData()
  }, [agentConnected])

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
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  const toggleYamlRevealed = () => setYamlRevealed(v => !v)

  const tabs: SecretTab[] = [
    { id: 'overview', label: t('drilldown.tabs.overview', 'Overview'), icon: Info },
    { id: 'data', label: t('drilldown.tabs.data', 'Data'), icon: Lock },
    { id: 'describe', label: t('drilldown.tabs.describe', 'Describe'), icon: FileText },
    { id: 'yaml', label: t('drilldown.tabs.yaml', 'YAML'), icon: Code },
  ]

  const dataEntries = Object.entries(secretData || {})
  const displayedData = showAllData ? dataEntries : dataEntries.slice(0, 5)

  return {
    cluster,
    namespace,
    secretName,
    drillToNamespace,
    drillToCluster,
    stackLength: state.stack.length,
    pop,
    activeTab,
    setActiveTab,
    secretData,
    secretType,
    describeOutput,
    describeLoading,
    yamlOutput,
    yamlLoading,
    dataLoading,
    dataError,
    labels,
    copiedField,
    showAllData,
    setShowAllData,
    revealedKeys,
    yamlRevealed,
    toggleYamlRevealed,
    handleCopy,
    toggleReveal,
    tabs,
    dataEntries,
    displayedData,
  }
}
