import { useState, useEffect, useRef, useCallback } from 'react'
import { useLocalAgent } from '../../../hooks/useLocalAgent'
import { useDrillDownWebSocket } from '../../../hooks/useDrillDownWebSocket'
import type { CSVInfo, CRDInfo, CRDRaw } from './operator-drilldown'

export interface UseOperatorDrillDownResult {
  csvInfo: CSVInfo | null
  csvLoading: boolean
  operatorCRDs: CRDInfo[] | null
  crdsLoading: boolean
}

/**
 * Owns all remote data loading for the Operator drill-down so the view
 * component stays presentational.
 */
export function useOperatorDrillDown(
  cluster: string,
  namespace: string,
  operatorName: string,
  currentCSV: string | undefined,
  operatorPhase: string,
  subscriptionName: string | undefined,
): UseOperatorDrillDownResult {
  const { isConnected: agentConnected } = useLocalAgent()
  const { runKubectl } = useDrillDownWebSocket(cluster)

  const [csvInfo, setCsvInfo] = useState<CSVInfo | null>(null)
  const [csvLoading, setCsvLoading] = useState(false)
  const [operatorCRDs, setOperatorCRDs] = useState<CRDInfo[] | null>(null)
  const [crdsLoading, setCrdsLoading] = useState(false)
  const [subscriptionYaml, setSubscriptionYaml] = useState<string | null>(null)

  const fetchCSVInfo = useCallback(async () => {
    if (!agentConnected || csvInfo) return
    setCsvLoading(true)
    try {
      const csvName = currentCSV || operatorName
      const output = await runKubectl(['get', 'clusterserviceversion', csvName, '-n', namespace, '-o', 'json'])
      if (output) {
        let csv
        try {
          csv = JSON.parse(output)
        } catch {
          console.warn('[OperatorDrillDown] Failed to parse CSV JSON output')
          setCsvInfo({ name: currentCSV || operatorName, displayName: operatorName, version: 'Unknown', phase: operatorPhase })
          return
        }
        const csvName2 = csv.metadata?.name || csvName
        setCsvInfo({
          name: csvName2,
          displayName: csv.spec?.displayName || csvName2,
          version: csv.spec?.version || 'Unknown',
          phase: csv.status?.phase || 'Unknown',
          description: csv.spec?.description,
          provider: csv.spec?.provider?.name,
          maturity: csv.spec?.maturity,
          maintainers: csv.spec?.maintainers,
          links: csv.spec?.links,
          installModes: csv.spec?.installModes,
        })
      }
    } catch {
      setCsvInfo({ name: currentCSV || operatorName, displayName: operatorName, version: 'Unknown', phase: operatorPhase })
    }
    setCsvLoading(false)
  }, [agentConnected, csvInfo, currentCSV, namespace, operatorName, operatorPhase, runKubectl])

  const fetchCRDs = useCallback(async () => {
    if (!agentConnected || operatorCRDs) return
    setCrdsLoading(true)
    try {
      const csvName = currentCSV || operatorName
      const output = await runKubectl(['get', 'clusterserviceversion', csvName, '-n', namespace, '-o', 'json'])
      if (output) {
        let csv
        try {
          csv = JSON.parse(output)
        } catch {
          console.warn('[OperatorDrillDown] Failed to parse CRD JSON output')
          setOperatorCRDs([])
          return
        }
        const crds = csv.spec?.customresourcedefinitions?.owned || []
        setOperatorCRDs(crds.map((crd: CRDRaw) => ({
          name: crd.name,
          kind: crd.kind,
          version: crd.version,
          description: crd.description,
        })))
      }
    } catch {
      setOperatorCRDs([])
    }
    setCrdsLoading(false)
  }, [agentConnected, currentCSV, namespace, operatorCRDs, operatorName, runKubectl])

  const fetchSubscription = useCallback(async () => {
    if (!agentConnected || subscriptionYaml) return
    try {
      const subName = subscriptionName || operatorName
      const output = await runKubectl(['get', 'subscription', subName, '-n', namespace, '-o', 'yaml'])
      setSubscriptionYaml(output || 'Subscription not found')
    } catch {
      setSubscriptionYaml('Error fetching subscription')
    }
  }, [agentConnected, namespace, operatorName, runKubectl, subscriptionName, subscriptionYaml])

  const hasLoadedRef = useRef(false)

  useEffect(() => {
    if (!agentConnected || hasLoadedRef.current) return
    hasLoadedRef.current = true
    void Promise.all([fetchCSVInfo(), fetchCRDs(), fetchSubscription()])
  }, [agentConnected, fetchCSVInfo, fetchCRDs, fetchSubscription])

  return { csvInfo, csvLoading, operatorCRDs, crdsLoading }
}
