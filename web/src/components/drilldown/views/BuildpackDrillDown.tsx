import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AIActionBar, type ResourceContext, useModalAI } from '../../modals'
import { useToast } from '../../ui/Toast'
import { useLocalAgent } from '../../../hooks/useLocalAgent'
import { useDrillDown, useDrillDownActions } from '../../../hooks/useDrillDown'
import { useDrillDownWebSocket } from '../../../hooks/useDrillDownWebSocket'
import { useMissions } from '../../../hooks/useMissions'
import { copyToClipboard } from '../../../lib/clipboard'
import { UI_FEEDBACK_TIMEOUT_MS } from '../../../lib/constants/network'
import {
  BuildpackAiPanel,
  BuildpackHeader,
  BuildpackTabs,
  BuildStepsPanel,
  EnvVarsTable,
  getStatusStyle,
  sortBuildsByNewest,
  type BuildpackStatus,
  type KpackBuild,
  type KpackImageStatus,
  type Props,
  type TabType,
  ImageDetailsPanel,
} from './buildpack-drilldown'

export function BuildpackDrillDown({ data }: Props) {
  const { t } = useTranslation()
  const cluster = data.cluster as string
  const namespace = data.namespace as string
  const name = data.name as string
  const status = (data.status as BuildpackStatus) || 'unknown'
  const builder = data.builder as string

  const { isConnected: agentConnected } = useLocalAgent()
  const { drillToNamespace, drillToCluster } = useDrillDownActions()
  const { close: closeDrillDown } = useDrillDown()
  const { startMission } = useMissions()
  const { showToast } = useToast()

  const [activeTab, setActiveTab] = useState<TabType>('overview')
  const [imageInfo, setImageInfo] = useState<KpackImageStatus | null>(null)
  const [imageYAML, setImageYAML] = useState<string | null>(null)
  const [builds, setBuilds] = useState<KpackBuild[]>([])
  const [logs, setLogs] = useState<string | null>(null)

  const [loading, setLoading] = useState(false)
  const [yamlLoading, setYamlLoading] = useState(false)
  const [buildsLoading, setBuildsLoading] = useState(false)
  const [logsLoading, setLogsLoading] = useState(false)

  const [copiedField, setCopiedField] = useState<string | null>(null)
  const copiedFieldTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasLoadedRef = useRef(false)

  const resourceContext: ResourceContext = {
    kind: 'BuildpackImage',
    name,
    cluster,
    namespace,
    status,
  }

  const issues =
    status.toLowerCase() === 'failed' || status.toLowerCase() === 'false'
      ? [{ name, message: 'Build failed', severity: 'critical' }]
      : []

  const { defaultAIActions, handleAIAction, isAgentConnected } = useModalAI({
    resource: resourceContext,
    issues,
  })
  const { runKubectl } = useDrillDownWebSocket(cluster)

  const fetchImageInfo = async () => {
    if (!agentConnected) return
    setLoading(true)
    try {
      const output = await runKubectl(['get', 'image', name, '-n', namespace, '-o', 'json'])
      if (output) {
        let parsed
        try {
          parsed = JSON.parse(output)
        } catch {
          setImageInfo(null)
          showToast(t('drilldown.errors.parseKubectlOutput', 'Failed to parse kubectl output'), 'error')
          return
        }
        setImageInfo(parsed)
      }
    } catch (error: unknown) {
      console.error('Failed to fetch image info:', error)
      showToast(t('drilldown.buildpack.fetchImageError', 'Failed to fetch image info'), 'error')
    }
    setLoading(false)
  }

  const fetchYAML = async () => {
    if (!agentConnected || imageYAML) return
    setYamlLoading(true)
    try {
      const output = await runKubectl(['get', 'image', name, '-n', namespace, '-o', 'yaml'])
      setImageYAML(output || 'No YAML available')
    } catch {
      setImageYAML('Error fetching YAML')
    }
    setYamlLoading(false)
  }

  const fetchBuilds = async () => {
    if (!agentConnected || builds.length > 0) return
    setBuildsLoading(true)
    try {
      const output = await runKubectl(['get', 'build', '-n', namespace, '-l', `image.kpack.io/image=${name}`, '-o', 'json'])
      if (output) {
        let parsed
        try {
          parsed = JSON.parse(output)
        } catch {
          setBuilds([])
          showToast(t('drilldown.errors.parseKubectlOutput', 'Failed to parse kubectl output'), 'error')
          return
        }
        setBuilds(parsed.items || [])
      }
    } catch (error: unknown) {
      console.error('Failed to fetch builds:', error)
      showToast(t('drilldown.buildpack.fetchBuildsError', 'Failed to fetch builds'), 'error')
      setBuilds([])
    }
    setBuildsLoading(false)
  }

  const fetchLogs = async () => {
    if (!agentConnected || logs) return
    setLogsLoading(true)

    try {
      let currentBuilds = builds
      if (currentBuilds.length === 0) {
        const output = await runKubectl(['get', 'build', '-n', namespace, '-l', `image.kpack.io/image=${name}`, '-o', 'json'])
        if (output) {
          let parsed
          try {
            parsed = JSON.parse(output)
          } catch {
            setBuilds([])
            showToast(t('drilldown.errors.parseKubectlOutput', 'Failed to parse kubectl output'), 'error')
            return
          }
          currentBuilds = parsed.items || []
          setBuilds(currentBuilds)
        }
      }

      if (currentBuilds.length > 0) {
        const latestBuild = sortBuildsByNewest(currentBuilds)[0]
        const output = await runKubectl(['logs', latestBuild.metadata.name, '-n', namespace, '--all-containers'])
        setLogs(output || 'No logs available')
      } else {
        setLogs('No builds found for this image')
      }
    } catch (error: unknown) {
      console.error('Failed to fetch logs:', error)
      showToast(t('drilldown.buildpack.fetchLogsError', 'Failed to fetch logs'), 'error')
      setLogs('Error fetching logs')
    }

    setLogsLoading(false)
  }

  useEffect(() => {
    if (!agentConnected || hasLoadedRef.current) return
    hasLoadedRef.current = true

    const loadData = async () => {
      await fetchImageInfo()
      await fetchBuilds()
    }
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentConnected])

  useEffect(() => {
    if (activeTab === 'yaml' && !imageYAML) fetchYAML()
    if (activeTab === 'logs' && !logs) fetchLogs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  const handleDiagnose = () => {
    closeDrillDown()
    startMission({
      title: `Diagnose Buildpack: ${name}`,
      description: 'Analyze buildpack health',
      type: 'troubleshoot',
      cluster,
      initialPrompt: `Analyze this kpack Image:

Name: ${name}
Namespace: ${namespace}
Cluster: ${cluster}
Status: ${status}
Builder: ${builder}
${imageInfo?.status?.latestImage ? `Latest Image: ${imageInfo.status.latestImage}` : ''}

Please:
1. Analyze the build health — status, failure causes, and configuration.
2. Tell me what you found, then ask:
   - "Should I fix the build issue?"
   - "Show me the build logs first"
3. If I say fix it, apply and verify. Then ask:
   - "Should I check other buildpack images?"
   - "All done"
`,
      context: {
        kind: 'BuildpackImage',
        name,
        namespace,
        cluster,
        status,
      },
    })
  }

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

  const statusStyle = getStatusStyle(status)

  return (
    <div className="flex flex-col h-full -m-6">
      <BuildpackHeader
        cluster={cluster}
        namespace={namespace}
        status={status}
        statusStyle={statusStyle}
        onDrillNamespace={() => drillToNamespace(cluster, namespace)}
        onDrillCluster={() => drillToCluster(cluster)}
      />

      <div className="px-6 pb-4">
        <AIActionBar
          resource={resourceContext}
          actions={defaultAIActions}
          onAction={handleAIAction}
          issueCount={issues.length}
          compact={false}
        />
      </div>

      <BuildpackTabs activeTab={activeTab} onTabChange={setActiveTab} />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {activeTab === 'overview' && (
          <ImageDetailsPanel
            loading={loading}
            name={name}
            status={status}
            imageInfo={imageInfo}
            builds={builds}
            builder={builder}
            copiedField={copiedField}
            onCopy={handleCopy}
          />
        )}

        {activeTab === 'yaml' && (
          <EnvVarsTable
            title="Image YAML"
            value={imageYAML}
            loading={yamlLoading}
            copiedField={copiedField}
            copyFieldKey="yaml"
            onCopy={handleCopy}
            className="text-xs bg-card p-4 rounded border border-border overflow-x-auto max-h-[600px]"
          />
        )}

        {activeTab === 'builds' && (
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-foreground">Build History</h4>
            <BuildStepsPanel buildsLoading={buildsLoading} builds={builds} />
          </div>
        )}

        {activeTab === 'logs' && (
          <EnvVarsTable
            title="Latest Build Logs"
            value={logs}
            loading={logsLoading}
            copiedField={copiedField}
            copyFieldKey="logs"
            onCopy={handleCopy}
            className="text-xs bg-card p-4 rounded border border-border max-h-[500px] overflow-auto"
          />
        )}

        {activeTab === 'ai' && (
          <BuildpackAiPanel
            isAgentConnected={isAgentConnected}
            onDiagnose={handleDiagnose}
          />
        )}
      </div>
    </div>
  )
}
