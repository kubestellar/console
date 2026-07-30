import { useState, useEffect, useRef, useCallback } from 'react'
import { useLocalAgent } from '../../../hooks/useLocalAgent'
import { useDrillDownWebSocket } from '../../../hooks/useDrillDownWebSocket'

export interface Violation {
  resource: string
  kind: string
  namespace?: string
  message: string
  timestamp?: string
}

interface ViolationRaw {
  name?: string
  kind?: string
  namespace?: string
  message?: string
}

export interface PolicySpec {
  match?: Record<string, unknown>
  parameters?: Record<string, unknown>
  validationFailureAction?: string
  background?: boolean
  rules?: Array<{
    name: string
    match?: Record<string, unknown>
    validate?: Record<string, unknown>
    mutate?: Record<string, unknown>
  }>
}

export interface UsePolicyDrillDownResult {
  agentConnected: boolean
  violations: Violation[] | null
  violationsLoading: boolean
  policySpec: PolicySpec | null
  specLoading: boolean
}

/**
 * Owns all remote data loading for the Policy drill-down (violations and spec)
 * so the view component stays presentational.
 */
export function usePolicyDrillDown(
  cluster: string,
  policyName: string,
  policyType: string,
  policyKind: string,
  namespace?: string
): UsePolicyDrillDownResult {
  const { isConnected: agentConnected } = useLocalAgent()
  const { runKubectl } = useDrillDownWebSocket(cluster)

  const [violations, setViolations] = useState<Violation[] | null>(null)
  const [violationsLoading, setViolationsLoading] = useState(false)
  const [policySpec, setPolicySpec] = useState<PolicySpec | null>(null)
  const [specLoading, setSpecLoading] = useState(false)

  // Fetch violations
  const fetchViolations = useCallback(async () => {
    if (!agentConnected || violations) return
    setViolationsLoading(true)
    try {
      let output: string
      if (policyType === 'kyverno') {
        // For Kyverno, fetch policy reports
        output = await runKubectl([
          'get', 'policyreport,clusterpolicyreport', '-A', '-o', 'json'
        ])
        if (output) {
          const data = JSON.parse(output)
          const items = data.items || []
          const policyViolations: Violation[] = []

          for (const report of items) {
            const results = report.results || []
            for (const result of results) {
              if (result.policy === policyName && result.result === 'fail') {
                policyViolations.push({
                  resource: result.resources?.[0]?.name || 'Unknown',
                  kind: result.resources?.[0]?.kind || 'Unknown',
                  namespace: result.resources?.[0]?.namespace,
                  message: result.message || 'Policy violation',
                  timestamp: typeof result.timestamp === 'string'
                    ? result.timestamp
                    : result.timestamp && typeof result.timestamp === 'object' && 'seconds' in result.timestamp
                      ? (() => { const d = new Date(Number(result.timestamp.seconds) * 1000); return isNaN(d.getTime()) ? undefined : d.toISOString() })()
                      : undefined,
                })
              }
            }
          }
          setViolations(policyViolations)
        }
      } else {
        // For OPA Gatekeeper, fetch constraint status
        output = await runKubectl([
          'get', policyKind.toLowerCase(), policyName, '-o', 'json'
        ])
        if (output) {
          const constraint = JSON.parse(output)
          const statusViolations = constraint.status?.violations || []
          setViolations(statusViolations.map((v: ViolationRaw) => ({
            resource: v.name || 'Unknown',
            kind: v.kind || 'Unknown',
            namespace: v.namespace,
            message: v.message || 'Policy violation',
          })))
        }
      }
    } catch {
      setViolations([])
    }
    setViolationsLoading(false)
  }, [agentConnected, violations, runKubectl, policyType, policyName, policyKind])

  // Fetch policy spec
  const fetchSpec = useCallback(async () => {
    if (!agentConnected || policySpec) return
    setSpecLoading(true)
    try {
      let output: string
      if (policyType === 'kyverno') {
        const resource = namespace ? `policy/${policyName}` : `clusterpolicy/${policyName}`
        const nsArgs = namespace ? ['-n', namespace] : []
        output = await runKubectl(['get', resource, ...nsArgs, '-o', 'json'])
      } else {
        output = await runKubectl([
          'get', policyKind.toLowerCase(), policyName, '-o', 'json'
        ])
      }

      if (output) {
        const policy = JSON.parse(output)
        setPolicySpec(policy.spec || {})
      }
    } catch {
      setPolicySpec({})
    }
    setSpecLoading(false)
  }, [agentConnected, policySpec, runKubectl, policyType, policyName, policyKind, namespace])

  // Track if we've already loaded data
  const hasLoadedRef = useRef(false)

  useEffect(() => {
    if (!agentConnected || hasLoadedRef.current) return
    hasLoadedRef.current = true

    const loadData = async () => {
      await Promise.all([fetchViolations(), fetchSpec()])
    }
    loadData()
  }, [agentConnected, fetchViolations, fetchSpec])

  return {
    agentConnected,
    violations,
    violationsLoading,
    policySpec,
    specLoading,
  }
}
