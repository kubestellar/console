import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocalAgent } from '../../../hooks/useLocalAgent'
import { useDrillDownWebSocket } from '../../../hooks/useDrillDownWebSocket'
import { UI_FEEDBACK_TIMEOUT_MS } from '../../../lib/constants/network'
import { copyToClipboard } from '../../../lib/clipboard'
import { deriveServiceHealth } from '../../../lib/services/serviceHealth'

export type ServiceTabType = 'overview' | 'endpoints' | 'describe' | 'yaml'

export interface ServiceEndpointAddress {
  ip: string
  nodeName?: string
  targetRef?: string
}

function normalizeLbStatus(value?: string): 'ready' | 'provisioning' | '' {
  const normalized = (value || '').toLowerCase()
  if (normalized === 'ready') return 'ready'
  if (normalized === 'provisioning') return 'provisioning'
  return ''
}

/**
 * Data-fetching state, effects, and derived values for ServiceDrillDown.
 * Pure UI rendering lives in ServiceDrillDown.parts.tsx / ServiceDrillDown.tsx.
 */
export function useServiceDrillDown(cluster: string, namespace: string, serviceName: string, data: Record<string, unknown>) {
  const { t } = useTranslation()
  const { isConnected: agentConnected } = useLocalAgent()
  const { runKubectl } = useDrillDownWebSocket(cluster)

  const [activeTab, setActiveTab] = useState<ServiceTabType>('overview')
  const [serviceType, setServiceType] = useState<string>((data.type as string) || 'ClusterIP')
  const [clusterIP, setClusterIP] = useState<string>((data.clusterIP as string) || '')
  const [externalIPs, setExternalIPs] = useState<string[]>((data.externalIPs as string[]) || (data.externalIP ? [data.externalIP as string] : []))
  const [ports, setPorts] = useState<string[]>((data.ports as string[]) || [])
  const [endpointCount, setEndpointCount] = useState<number | undefined>(data.endpoints as number | undefined)
  const [lbStatus, setLbStatus] = useState<'ready' | 'provisioning' | ''>(normalizeLbStatus(data.lbStatus as string | undefined))
  const [selector, setSelector] = useState<Record<string, string> | null>((data.selector as Record<string, string>) || null)
  const [labels, setLabels] = useState<Record<string, string> | null>(null)
  const [, setAnnotations] = useState<Record<string, string> | null>(null)
  const [endpointAddresses, setEndpointAddresses] = useState<ServiceEndpointAddress[]>([])
  const [describeOutput, setDescribeOutput] = useState<string | null>(null)
  const [describeLoading, setDescribeLoading] = useState(false)
  const [yamlOutput, setYamlOutput] = useState<string | null>(null)
  const [yamlLoading, setYamlLoading] = useState(false)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const copiedFieldTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  // Fetch service details on mount
  const fetchedRef = useRef(false)
  useEffect(() => {
    if (!agentConnected || fetchedRef.current) return
    fetchedRef.current = true
    setIsLoading(true)

    const fetchDetails = async () => {
      try {
        const raw = await runKubectl(['get', 'service', serviceName, '-n', namespace, '-o', 'json'])
        const svc = JSON.parse(raw)
        const spec = svc.spec || {}
        const status = svc.status || {}

        setServiceType(spec.type || 'ClusterIP')
        setClusterIP(spec.clusterIP || '')
        setPorts((spec.ports || []).map((p: { port: number; protocol?: string; nodePort?: number; name?: string }) => {
          const base = p.nodePort ? `${p.port}:${p.nodePort}/${p.protocol || 'TCP'}` : `${p.port}/${p.protocol || 'TCP'}`
          return p.name ? `${p.name}: ${base}` : base
        }))

        // External IPs: combine spec.externalIPs and status.loadBalancer.ingress
        const allExternalIPs: string[] = []
        if (spec.externalIPs) {
          allExternalIPs.push(...spec.externalIPs)
        }
        const ingress = status.loadBalancer?.ingress || []
        for (const entry of ingress) {
          if (entry.ip) allExternalIPs.push(entry.ip)
          else if (entry.hostname) allExternalIPs.push(entry.hostname)
        }
        setExternalIPs(allExternalIPs)

        // LB status
        if (spec.type === 'LoadBalancer') {
          setLbStatus(ingress.length > 0 ? 'ready' : 'provisioning')
        }

        setSelector(spec.selector || null)
        setLabels(svc.metadata?.labels || null)
        setAnnotations(svc.metadata?.annotations || null)
      } catch { /* ignore parse errors */ }

      // Fetch endpoints
      try {
        const epRaw = await runKubectl(['get', 'endpoints', serviceName, '-n', namespace, '-o', 'json'])
        const ep = JSON.parse(epRaw)
        const addrs: ServiceEndpointAddress[] = []
        for (const subset of (ep.subsets || [])) {
          for (const addr of (subset.addresses || [])) {
            addrs.push({
              ip: addr.ip,
              nodeName: addr.nodeName,
              targetRef: addr.targetRef?.name,
            })
          }
        }
        setEndpointAddresses(addrs)
        setEndpointCount(addrs.length)
      } catch { /* ignore */ }

      setIsLoading(false)
    }

    fetchDetails()
  }, [agentConnected, cluster, namespace, serviceName, runKubectl])

  useEffect(() => {
    return () => {
      if (copiedFieldTimeoutRef.current) {
        clearTimeout(copiedFieldTimeoutRef.current)
      }
    }
  }, [])

  const handleCopy = async (text: string, field: string) => {
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
  }

  const loadDescribe = async () => {
    setDescribeLoading(true)
    const output = await runKubectl(['describe', 'service', serviceName, '-n', namespace])
    setDescribeOutput(output)
    setDescribeLoading(false)
  }

  const loadYaml = async () => {
    setYamlLoading(true)
    const output = await runKubectl(['get', 'service', serviceName, '-n', namespace, '-o', 'yaml'])
    setYamlOutput(output)
    setYamlLoading(false)
  }

  const health = deriveServiceHealth({
    endpoints: endpointCount,
    selector: selector || undefined,
    lbStatus,
    type: serviceType,
  })

  const lbStatusLabel = lbStatus === 'ready'
    ? t('drilldown.service.loadBalancerReady')
    : t('drilldown.service.loadBalancerProvisioning')

  const tabs: { id: ServiceTabType; label: string }[] = [
    { id: 'overview', label: t('drilldown.tabs.overview') },
    { id: 'endpoints', label: t('drilldown.tabs.endpoints') },
    { id: 'describe', label: t('drilldown.tabs.describe') },
    { id: 'yaml', label: t('drilldown.tabs.yaml') },
  ]

  return {
    activeTab, setActiveTab,
    serviceType, clusterIP, externalIPs, ports, endpointCount, lbStatus,
    selector, labels, endpointAddresses,
    describeOutput, describeLoading, loadDescribe,
    yamlOutput, yamlLoading, loadYaml,
    copiedField, handleCopy,
    isLoading, health, lbStatusLabel, tabs,
  }
}
