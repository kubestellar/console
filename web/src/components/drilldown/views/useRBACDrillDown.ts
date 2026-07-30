import { useState, useEffect, useRef, useCallback } from 'react'
import { useLocalAgent } from '../../../hooks/useLocalAgent'
import { useDrillDownWebSocket } from '../../../hooks/useDrillDownWebSocket'
import { UI_FEEDBACK_TIMEOUT_MS } from '../../../lib/constants/network'
import { copyToClipboard } from '../../../lib/clipboard'
import { useTranslation } from 'react-i18next'

/** Maximum number of bindings the Describe and YAML tabs render inline. */
export const MAX_BINDINGS_TO_DESCRIBE = 10

export interface RoleBinding {
  kind: string
  name: string
  namespace?: string
  roleName: string
  roleKind: string
}

export type DrillDownKind =
  | 'User'
  | 'Group'
  | 'ServiceAccount'
  | 'Role'
  | 'RoleBinding'
  | 'ClusterRole'
  | 'ClusterRoleBinding'

const SUBJECT_KINDS = new Set<DrillDownKind>(['User', 'Group', 'ServiceAccount'])

export interface UseRBACDrillDownResult {
  agentConnected: boolean
  clusterBindings: RoleBinding[]
  roleBindings: RoleBinding[]
  loading: boolean
  loadError: string | null
  describeOutput: string | null
  describeLoading: boolean
  yamlOutput: string | null
  yamlLoading: boolean
  copiedField: string | null
  refreshing: boolean
  totalBindings: number
  hiddenBindingCount: number
  fetchDescribe: () => Promise<void>
  fetchYaml: () => Promise<void>
  handleRefresh: () => Promise<void>
  handleCopy: (field: string, value: string) => void
}

export function useRBACDrillDown(
  cluster: string,
  namespace: string | undefined,
  subject: string,
  subjectType: DrillDownKind,
): UseRBACDrillDownResult {
  const { t } = useTranslation()
  const { isConnected: agentConnected } = useLocalAgent()
  const { runKubectl } = useDrillDownWebSocket(cluster)

  const [clusterBindings, setClusterBindings] = useState<RoleBinding[]>([])
  const [roleBindings, setRoleBindings] = useState<RoleBinding[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [describeOutput, setDescribeOutput] = useState<string | null>(null)
  const [describeLoading, setDescribeLoading] = useState(false)
  const [yamlOutput, setYamlOutput] = useState<string | null>(null)
  const [yamlLoading, setYamlLoading] = useState(false)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const mountedRef = useRef(true)
  const copyTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const hasLoadedRef = useRef(false)
  const prevAgentConnectedRef = useRef(agentConnected)

  useEffect(() => {
    return () => {
      mountedRef.current = false
      clearTimeout(copyTimerRef.current)
    }
  }, [])

  const parseBindings = useCallback(
    (json: string, kind: string): RoleBinding[] => {
      try {
        const parsed = JSON.parse(json)
        const items = parsed.items || []
        return items
          .filter((item: Record<string, unknown>) => {
            if (SUBJECT_KINDS.has(subjectType)) {
              const subjects = item.subjects as Array<{ kind: string; name: string }> | undefined
              return subjects?.some(s => s.name === subject && s.kind === subjectType)
            }
            if (subjectType === 'Role' || subjectType === 'ClusterRole') {
              const roleRef = item.roleRef as { kind: string; name: string } | undefined
              return roleRef?.name === subject
            }
            if (subjectType === 'RoleBinding' || subjectType === 'ClusterRoleBinding') {
              const meta = item.metadata as { name: string } | undefined
              return meta?.name === subject
            }
            return false
          })
          .map((item: Record<string, unknown>) => {
            const roleRef = item.roleRef as { kind: string; name: string }
            const meta = item.metadata as { name: string; namespace?: string }
            return {
              kind,
              name: meta.name,
              namespace: meta.namespace,
              roleName: roleRef.name,
              roleKind: roleRef.kind,
            }
          })
      } catch {
        return []
      }
    },
    [subject, subjectType],
  )

  const fetchBindings = useCallback(async () => {
    if (!agentConnected) return
    setLoading(true)
    setLoadError(null)
    try {
      const [crbOut, rbOut] = await Promise.all([
        runKubectl(['get', 'clusterrolebindings', '-o', 'json']),
        namespace
          ? runKubectl(['get', 'rolebindings', '-n', namespace, '-o', 'json'])
          : runKubectl(['get', 'rolebindings', '--all-namespaces', '-o', 'json']),
      ])
      if (!mountedRef.current) return
      setClusterBindings(parseBindings(crbOut, 'ClusterRoleBinding'))
      setRoleBindings(parseBindings(rbOut, 'RoleBinding'))
    } catch (err) {
      if (!mountedRef.current) return
      const errMsg = err instanceof Error ? err.message : 'Failed to fetch bindings'
      setLoadError(errMsg)
      setClusterBindings([])
      setRoleBindings([])
    }
    setLoading(false)
  }, [agentConnected, namespace, parseBindings, runKubectl])

  const fetchDescribe = useCallback(async () => {
    if (!agentConnected || describeOutput) return
    setDescribeLoading(true)
    const bindings = [...clusterBindings, ...roleBindings]
    const parts: string[] = []
    for (const b of bindings.slice(0, MAX_BINDINGS_TO_DESCRIBE)) {
      if (!mountedRef.current) return
      const args =
        b.kind === 'ClusterRoleBinding'
          ? ['describe', 'clusterrolebinding', b.name]
          : ['describe', 'rolebinding', b.name, '-n', b.namespace || 'default']
      const out = await runKubectl(args)
      if (out) parts.push(out)
    }
    if (!mountedRef.current) return
    setDescribeOutput(parts.join('\n---\n') || t('drilldown.empty.noBindingsFound'))
    setDescribeLoading(false)
  }, [agentConnected, clusterBindings, describeOutput, roleBindings, runKubectl, t])

  const fetchYaml = useCallback(async () => {
    if (!agentConnected || yamlOutput) return
    setYamlLoading(true)
    const bindings = [...clusterBindings, ...roleBindings]
    const parts: string[] = []
    for (const b of bindings.slice(0, MAX_BINDINGS_TO_DESCRIBE)) {
      if (!mountedRef.current) return
      const args =
        b.kind === 'ClusterRoleBinding'
          ? ['get', 'clusterrolebinding', b.name, '-o', 'yaml']
          : ['get', 'rolebinding', b.name, '-n', b.namespace || 'default', '-o', 'yaml']
      const out = await runKubectl(args)
      if (out) parts.push(out)
    }
    if (!mountedRef.current) return
    setYamlOutput(parts.join('\n---\n') || t('drilldown.empty.noBindingsFound'))
    setYamlLoading(false)
  }, [agentConnected, clusterBindings, roleBindings, runKubectl, yamlOutput, t])

  useEffect(() => {
    if (agentConnected && !hasLoadedRef.current) {
      hasLoadedRef.current = true
      fetchBindings()
    }
    // If the agent reconnected after having been disconnected, force a refresh
    if (agentConnected && !prevAgentConnectedRef.current && hasLoadedRef.current) {
      setDescribeOutput(null)
      setYamlOutput(null)
      fetchBindings()
    }
    prevAgentConnectedRef.current = agentConnected
  }, [agentConnected, fetchBindings])

  const handleRefresh = useCallback(async () => {
    if (!agentConnected || refreshing) return
    setRefreshing(true)
    setDescribeOutput(null)
    setYamlOutput(null)
    try {
      await fetchBindings()
    } finally {
      setRefreshing(false)
    }
  }, [agentConnected, fetchBindings, refreshing])

  const handleCopy = (field: string, value: string) => {
    copyToClipboard(value)
    setCopiedField(field)
    clearTimeout(copyTimerRef.current)
    copyTimerRef.current = setTimeout(() => setCopiedField(null), UI_FEEDBACK_TIMEOUT_MS)
  }

  const totalBindings = clusterBindings.length + roleBindings.length
  const hiddenBindingCount = Math.max(0, totalBindings - MAX_BINDINGS_TO_DESCRIBE)

  return {
    agentConnected,
    clusterBindings,
    roleBindings,
    loading,
    loadError,
    describeOutput,
    describeLoading,
    yamlOutput,
    yamlLoading,
    copiedField,
    refreshing,
    totalBindings,
    hiddenBindingCount,
    fetchDescribe,
    fetchYaml,
    handleRefresh,
    handleCopy,
  }
}
