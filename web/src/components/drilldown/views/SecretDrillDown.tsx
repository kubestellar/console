import { useState, useEffect, useRef } from 'react'
import { useLocalAgent } from '../../../hooks/useLocalAgent'
import { useDrillDownWebSocket } from '../../../hooks/useDrillDownWebSocket'
import { useDrillDownActions, useDrillDown } from '../../../hooks/useDrillDown'
import { ClusterBadge } from '../../ui/ClusterBadge'
import { FileText, Code, Info, ChevronLeft, Layers, Server, Lock } from 'lucide-react'
import { cn } from '../../../lib/cn'
import { UI_FEEDBACK_TIMEOUT_MS } from '../../../lib/constants/network'
import { useTranslation } from 'react-i18next'
import { copyToClipboard } from '../../../lib/clipboard'
import { SecretDrillDownProps, TabType, UNSAFE_PROP_NAMES } from './SecretDrillDown.types'
import { OverviewTab, DataTab, DescribeTab, YamlTab } from './SecretDrillDown.parts'

// #6231: the regex-based maskSecretYaml that used to live here had two
// real bugs (block-scalar handling, false bundle-bloat claim about
// js-yaml). Replaced by a shared js-yaml-based helper in lib/yamlMask.
// Re-exported here for backward compat with any importer that might
// still reference SecretDrillDown.maskSecretYaml; new code should
// import maskKubernetesYamlData from '../../../lib/yamlMask' directly.
import { maskKubernetesYamlData } from '../../../lib/yamlMask'
/** @deprecated use `maskKubernetesYamlData` from `lib/yamlMask` */
export const maskSecretYaml = maskKubernetesYamlData

export function SecretDrillDown({ data }: SecretDrillDownProps) {
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
  // YAML tab reveal state — defaults to MASKED so the `data:` block doesn't
  // leak base64-encoded secrets the moment a user clicks the YAML tab
  // (#6209). Mirrors the per-key reveal pattern on the Data tab — explicit
  // user action required to see secrets.
  const [yamlRevealed, setYamlRevealed] = useState(false)


  // Fetch Secret data
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
  useEffect(() => {
    if (!agentConnected || hasLoadedRef.current) return
    hasLoadedRef.current = true

    const loadData = async () => {
      // Batch 1: Overview data (2 concurrent)
      await Promise.all([
        fetchData(),
        fetchDescribe(),
      ])

      // Batch 2: YAML (lower priority)
      await fetchYaml()
    }

    loadData()
  }, [agentConnected, fetchData, fetchDescribe, fetchYaml])

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

  const TABS: { id: TabType; label: string; icon: typeof Info }[] = [
    { id: 'overview', label: t('drilldown.tabs.overview', 'Overview'), icon: Info },
    { id: 'data', label: t('drilldown.tabs.data', 'Data'), icon: Lock },
    { id: 'describe', label: t('drilldown.tabs.describe', 'Describe'), icon: FileText },
    { id: 'yaml', label: t('drilldown.tabs.yaml', 'YAML'), icon: Code },
  ]

  const dataEntries = Object.entries(secretData || {})
  const displayedData = showAllData ? dataEntries : dataEntries.slice(0, 5)

  return (
    <div className="flex flex-col h-full -m-6">
      {/* Header */}
      <div className="px-6 pt-6 pb-4">
        <div className="flex items-center gap-6 text-sm">
          {state.stack.length > 1 && (
            <button
              type="button"
              onClick={pop}
              className="flex items-center gap-2 hover:bg-secondary/50 border border-transparent hover:border-border px-3 py-1.5 rounded-lg transition-all text-muted-foreground hover:text-foreground"
              aria-label={t('drilldown.goBack')}
              title={t('drilldown.goBack')}
            >
              <ChevronLeft className="w-4 h-4" />
              <span>{t('common.back')}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => drillToNamespace(cluster, namespace)}
            className="flex items-center gap-2 hover:bg-purple-500/10 border border-transparent hover:border-purple-500/30 px-3 py-1.5 rounded-lg transition-all group cursor-pointer"
          >
            <Layers className="w-4 h-4 text-purple-400" />
            <span className="text-muted-foreground">{t('drilldown.fields.namespace')}</span>
            <span className="font-mono text-purple-400 group-hover:text-purple-300 transition-colors">{namespace}</span>
            <svg className="w-3 h-3 text-purple-400/70 group-hover:text-purple-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => drillToCluster(cluster)}
            className="flex items-center gap-2 hover:bg-blue-500/10 border border-transparent hover:border-blue-500/30 px-3 py-1.5 rounded-lg transition-all group cursor-pointer"
          >
            <Server className="w-4 h-4 text-blue-400" />
            <span className="text-muted-foreground">{t('drilldown.fields.cluster')}</span>
            <ClusterBadge cluster={cluster.split('/').pop() || cluster} size="sm" />
            <svg className="w-3 h-3 text-blue-400/70 group-hover:text-blue-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border px-6">
        <div className="flex gap-1">
          {TABS.map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'px-4 py-2 text-sm font-medium flex items-center gap-2 border-b-2 transition-colors',
                  activeTab === tab.id
                    ? 'text-primary border-primary'
                    : 'text-muted-foreground border-transparent hover:text-foreground hover:border-border'
                )}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {activeTab === 'overview' && (
          <OverviewTab
            dataLoading={dataLoading}
            dataError={dataError}
            secretName={secretName}
            secretType={secretType}
            dataEntries={dataEntries}
            labels={labels}
          />
        )}

        {activeTab === 'data' && (
          <DataTab
            dataEntries={dataEntries}
            revealedKeys={revealedKeys}
            toggleReveal={toggleReveal}
            handleCopy={handleCopy}
            copiedField={copiedField}
            showAllData={showAllData}
            setShowAllData={setShowAllData}
          />
        )}

        {activeTab === 'describe' && (
          <DescribeTab
            describeLoading={describeLoading}
            describeOutput={describeOutput}
            handleCopy={handleCopy}
            copiedField={copiedField}
          />
        )}

        {activeTab === 'yaml' && (
          <YamlTab
            yamlLoading={yamlLoading}
            yamlOutput={yamlOutput}
            yamlRevealed={yamlRevealed}
            setYamlRevealed={setYamlRevealed}
            handleCopy={handleCopy}
            copiedField={copiedField}
          />
        )}
      </div>
    </div>
  )
}
