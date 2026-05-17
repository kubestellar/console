import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type { GPUHealthCheckResult } from '../hooks/mcp/types'
import type { NightlyGuideStatus } from '../lib/llmd/nightlyE2EDemoData'
import type { Alert, AlertChannel, AlertRule } from '../types/alerts'
import type { AlertsMCPData } from './AlertsDataFetcher'
import type { BrowserNotificationParams } from './notifications'
import type { AlertMutation, AlertNotificationBatch, MutationAccumulator } from './AlertsContext.types'
import { DEFAULT_TEMPERATURE_THRESHOLD_F, DEFAULT_WIND_SPEED_THRESHOLD_MPH, MAX_ALERTS } from './alertStorage'
import { isClusterUnreachable } from './notifications'
import { alertDedupKey } from './alerts/deduplication'

const LOCAL_DEV_DISTRIBUTIONS = ['k3d', 'k3s', 'kind', 'minikube']
const DEMO_TRIGGER_PROBABILITY = 0.1

type Cluster = AlertsMCPData['clusters'][number]
type PodIssue = AlertsMCPData['podIssues'][number]

export function generateId(): string {
  return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

export function isLocalDevCluster(cluster: { distribution?: string; server?: string }): boolean {
  if (cluster.distribution && LOCAL_DEV_DISTRIBUTIONS.includes(cluster.distribution)) return true
  if (!cluster.server) return false
  const serverLower = cluster.server.toLowerCase()
  return serverLower.includes('localhost') || serverLower.includes('127.0.0.1')
}

export function shallowEqualRecords(a: Record<string, unknown> | null | undefined, b: Record<string, unknown> | null | undefined): boolean {
  if (a == null && b == null) return true
  if (a == null || b == null) return false
  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  return keysA.length === keysB.length && keysA.every(key => a[key] === b[key])
}

export function applyMutations(prev: Alert[], mutations: AlertMutation[], rules: AlertRule[]): Alert[] {
  if (mutations.length === 0) return prev
  let result = [...prev]
  const resolvedAt = new Date().toISOString()
  const ruleTypeMap = new Map(rules.map(rule => [rule.id, rule.condition.type]))
  const dedupIndex = new Map<string, number>()
  for (let i = 0; i < result.length; i++) {
    const alert = result[i]
    if (alert.status !== 'firing') continue
    dedupIndex.set(alertDedupKey(alert.ruleId, ruleTypeMap.get(alert.ruleId) ?? '', alert.cluster, alert.resource, alert.namespace), i)
  }

  for (const mutation of mutations) {
    if (mutation.type === 'create') {
      const key = alertDedupKey(
        mutation.alert.ruleId,
        ruleTypeMap.get(mutation.alert.ruleId) ?? '',
        mutation.alert.cluster,
        mutation.alert.resource,
        mutation.alert.namespace
      )
      const existingIdx = dedupIndex.get(key)
      if (existingIdx !== undefined) {
        const existing = result[existingIdx]
        if (new Date(mutation.alert.firedAt) >= new Date(existing.firedAt)) {
          result[existingIdx] = { ...mutation.alert, id: existing.id }
        }
        continue
      }
      result = [mutation.alert, ...result]
      const nextIndex = new Map<string, number>([[key, 0]])
      for (const [dedupKey, index] of dedupIndex) nextIndex.set(dedupKey, index + 1)
      dedupIndex.clear()
      for (const [dedupKey, index] of nextIndex) dedupIndex.set(dedupKey, index)
      continue
    }

    if (mutation.type === 'update') {
      const idx = dedupIndex.get(mutation.dedupKey)
      if (idx === undefined) continue
      const existing = result[idx]
      if (
        existing.message === mutation.message &&
        existing.resource === mutation.resource &&
        existing.namespace === mutation.namespace &&
        existing.resourceKind === mutation.resourceKind &&
        shallowEqualRecords(existing.details, mutation.details)
      ) {
        continue
      }
      result[idx] = {
        ...existing,
        message: mutation.message,
        details: mutation.details,
        resource: mutation.resource,
        namespace: mutation.namespace,
        resourceKind: mutation.resourceKind,
      }
      continue
    }

    if (mutation.matchAny) {
      for (let i = 0; i < result.length; i++) {
        if (result[i].ruleId === mutation.ruleId && result[i].status === 'firing') {
          result[i] = { ...result[i], status: 'resolved', resolvedAt }
        }
      }
      continue
    }

    if (!mutation.cluster) continue
    for (let i = 0; i < result.length; i++) {
      if (
        result[i].ruleId === mutation.ruleId &&
        result[i].status === 'firing' &&
        result[i].cluster === mutation.cluster &&
        (!mutation.resource || result[i].resource === mutation.resource)
      ) {
        result[i] = { ...result[i], status: 'resolved', resolvedAt }
      }
    }
  }

  if (result.length <= MAX_ALERTS) return result
  const firing = result.filter(alert => alert.status === 'firing')
  const resolved = result
    .filter(alert => alert.status === 'resolved')
    .sort((a, b) => new Date(b.resolvedAt ?? b.firedAt).getTime() - new Date(a.resolvedAt ?? a.firedAt).getTime())
    .slice(0, Math.max(0, MAX_ALERTS - firing.length))
  return [...firing, ...resolved]
}

interface AlertRulesEngineDeps {
  alertsRef: MutableRefObject<Alert[]>
  gpuNodesRef: MutableRefObject<AlertsMCPData['gpuNodes']>
  podIssuesRef: MutableRefObject<AlertsMCPData['podIssues']>
  clustersRef: MutableRefObject<AlertsMCPData['clusters']>
  rulesRef: MutableRefObject<AlertRule[]>
  mutationAccRef: MutableRefObject<MutationAccumulator | null>
  cronJobResultsRef: MutableRefObject<Record<string, GPUHealthCheckResult[]>>
  nightlyE2ERef: MutableRefObject<NightlyGuideStatus[]>
  nightlyAlertedRunsRef: MutableRefObject<Set<number>>
  isEvaluatingRef: MutableRefObject<boolean>
  isDemoMode: boolean
  setAlerts: Dispatch<SetStateAction<Alert[]>>
  setIsEvaluating: Dispatch<SetStateAction<boolean>>
  localSendNotifications: (alert: Alert, channels: AlertChannel[]) => Promise<unknown>
  queueBatchedNotifications: (notifications: AlertNotificationBatch[]) => void
  dispatchBrowserNotification: (params: BrowserNotificationParams) => void
  deleteNotifiedKey: (key: string) => void
  persistNotifiedAlertKeys: () => void
}

export function createAlertRulesEngine({
  alertsRef,
  gpuNodesRef,
  podIssuesRef,
  clustersRef,
  rulesRef,
  mutationAccRef,
  cronJobResultsRef,
  nightlyE2ERef,
  nightlyAlertedRunsRef,
  isEvaluatingRef,
  isDemoMode,
  setAlerts,
  setIsEvaluating,
  localSendNotifications,
  queueBatchedNotifications,
  dispatchBrowserNotification,
  deleteNotifiedKey,
  persistNotifiedAlertKeys,
}: AlertRulesEngineDeps) {
  const getRelevantClusters = (rule: AlertRule): Cluster[] => {
    const currentClusters = clustersRef.current || []
    return rule.condition.clusters?.length
      ? currentClusters.filter(cluster => rule.condition.clusters!.includes(cluster.name))
      : currentClusters
  }
  const getEnabledChannels = (rule: AlertRule) => (rule.channels || []).filter(channel => channel.enabled)

  const createAlert = (
    rule: AlertRule,
    message: string,
    details: Record<string, unknown>,
    cluster?: string,
    namespace?: string,
    resource?: string,
    resourceKind?: string
  ) => {
    const dedupKey = alertDedupKey(rule.id, rule.condition.type, cluster, resource, namespace)
    const acc = mutationAccRef.current

    if (acc) {
      const hasExistingAlert = alertsRef.current.some(
        alert => alert.ruleId === rule.id && alert.status === 'firing' &&
          alertDedupKey(alert.ruleId, rule.condition.type, alert.cluster, alert.resource, alert.namespace) === dedupKey
      )
      const alreadyQueued = acc.mutations.some(
        mutation => mutation.type === 'create' &&
          alertDedupKey(
            mutation.alert.ruleId,
            mutation.rule.condition.type,
            mutation.alert.cluster,
            mutation.alert.resource,
            mutation.alert.namespace
          ) === dedupKey
      )
      if (hasExistingAlert) {
        acc.mutations.push({ type: 'update', dedupKey, conditionType: rule.condition.type, message, details, resource, namespace, resourceKind })
        return
      }
      if (alreadyQueued) return
      const alert: Alert = {
        id: generateId(), ruleId: rule.id, ruleName: rule.name, severity: rule.severity,
        status: 'firing', message, details, cluster, namespace, resource, resourceKind,
        firedAt: new Date().toISOString(), isDemo: isDemoMode, signalType: 'state',
      }
      acc.mutations.push({ type: 'create', rule, alert })
      const enabledChannels = getEnabledChannels(rule)
      if (enabledChannels.length > 0) acc.notifications.push({ alert, channels: enabledChannels })
      return
    }

    const existingAlertForDedup = alertsRef.current.find(
      alert => alert.ruleId === rule.id && alert.status === 'firing' &&
        alertDedupKey(alert.ruleId, rule.condition.type, alert.cluster, alert.resource, alert.namespace) === dedupKey
    )
    const newAlert: Alert = {
      id: generateId(), ruleId: rule.id, ruleName: rule.name, severity: rule.severity,
      status: 'firing', message, details, cluster, namespace, resource, resourceKind,
      firedAt: new Date().toISOString(), isDemo: isDemoMode, signalType: 'state',
    }

    setAlerts(prev => {
      const existingAlert = prev.find(
        alert => alert.ruleId === rule.id && alert.status === 'firing' &&
          alertDedupKey(alert.ruleId, rule.condition.type, alert.cluster, alert.resource, alert.namespace) === dedupKey
      )
      if (existingAlert) {
        if (
          existingAlert.message === message && existingAlert.resource === resource && existingAlert.namespace === namespace &&
          existingAlert.resourceKind === resourceKind && shallowEqualRecords(existingAlert.details, details)
        ) {
          return prev
        }
        return prev.map(alert => alert.id === existingAlert.id ? { ...alert, message, details, resource, namespace, resourceKind } : alert)
      }
      const nextAlerts = [newAlert, ...prev]
      if (nextAlerts.length <= MAX_ALERTS) return nextAlerts
      const firingAlerts = nextAlerts.filter(alert => alert.status === 'firing')
      const resolvedAlerts = nextAlerts
        .filter(alert => alert.status === 'resolved')
        .sort((a, b) => new Date(b.resolvedAt ?? b.firedAt).getTime() - new Date(a.resolvedAt ?? a.firedAt).getTime())
        .slice(0, Math.max(0, MAX_ALERTS - firingAlerts.length))
      return [...firingAlerts, ...resolvedAlerts]
    })

    if (existingAlertForDedup) return
    queueMicrotask(() => {
      const enabledChannels = getEnabledChannels(rule)
      if (enabledChannels.length > 0) {
        localSendNotifications(newAlert, enabledChannels).catch(error => console.warn('[AlertsContext] firing notification send failed:', error))
      }
    })
  }

  const queueAutoResolve = (ruleId: string, cluster?: string, matchAny?: boolean) => {
    const acc = mutationAccRef.current
    if (acc) {
      acc.mutations.push({ type: 'resolve', ruleId, cluster, matchAny })
      return
    }
    setAlerts(prev => {
      const firingAlert = prev.find(alert => alert.ruleId === ruleId && alert.status === 'firing' && (matchAny || alert.cluster === cluster))
      return firingAlert
        ? prev.map(alert => alert.id === firingAlert.id ? { ...alert, status: 'resolved' as const, resolvedAt: new Date().toISOString() } : alert)
        : prev
    })
  }

  const evaluateGPUUsage = (rule: AlertRule) => {
    const threshold = rule.condition.threshold || 90
    const currentGPUNodes = gpuNodesRef.current || []
    for (const cluster of getRelevantClusters(rule)) {
      const clusterGPUNodes = currentGPUNodes.filter(node => node.cluster === cluster.name)
      const totalGPUs = clusterGPUNodes.reduce((sum, node) => sum + node.gpuCount, 0)
      const allocatedGPUs = clusterGPUNodes.reduce((sum, node) => sum + node.gpuAllocated, 0)
      if (totalGPUs === 0) continue
      const usagePercent = (allocatedGPUs / totalGPUs) * 100
      if (usagePercent >= threshold) {
        createAlert(rule, `GPU usage is ${usagePercent.toFixed(1)}% (${allocatedGPUs}/${totalGPUs} GPUs allocated)`, {
          usagePercent, allocatedGPUs, totalGPUs, threshold,
        }, cluster.name, undefined, 'nvidia.com/gpu', 'Resource')
      } else {
        queueAutoResolve(rule.id, cluster.name)
      }
    }
  }

  const evaluateNodeReady = (rule: AlertRule) => {
    for (const cluster of getRelevantClusters(rule)) {
      if (isClusterUnreachable(cluster) || (cluster.healthy === false && isLocalDevCluster(cluster))) {
        queueAutoResolve(rule.id, cluster.name)
        continue
      }
      if (cluster.healthy === false) {
        createAlert(rule, `Cluster ${cluster.name} has nodes not in Ready state`, {
          clusterHealthy: cluster.healthy, nodeCount: cluster.nodeCount,
        }, cluster.name, undefined, cluster.name, 'Cluster')
      } else {
        queueAutoResolve(rule.id, cluster.name)
      }
    }
  }

  const evaluatePodCrash = (rule: AlertRule) => {
    const threshold = rule.condition.threshold || 5
    const stillFiringKeys = new Set<string>()
    for (const issue of (podIssuesRef.current || [])) {
      if (!issue.restarts || issue.restarts < threshold) continue
      const clusterMatch = !rule.condition.clusters?.length || rule.condition.clusters.includes(issue.cluster || '')
      const namespaceMatch = !rule.condition.namespaces?.length || rule.condition.namespaces.includes(issue.namespace || '')
      if (!clusterMatch || !namespaceMatch) continue
      stillFiringKeys.add(alertDedupKey(rule.id, rule.condition.type, issue.cluster, issue.name, issue.namespace))
      createAlert(rule, `Pod ${issue.name} has restarted ${issue.restarts} times (${issue.status})`, {
        restarts: issue.restarts, status: issue.status, reason: issue.reason,
      }, issue.cluster, issue.namespace, issue.name, 'Pod')
    }
    for (const alert of (alertsRef.current || [])) {
      if (alert.ruleId !== rule.id || alert.status !== 'firing') continue
      const key = alertDedupKey(alert.ruleId, rule.condition.type, alert.cluster, alert.resource, alert.namespace)
      if (!stillFiringKeys.has(key) && mutationAccRef.current) {
        mutationAccRef.current.mutations.push({ type: 'resolve', ruleId: rule.id, cluster: alert.cluster, resource: alert.resource })
      }
    }
  }

  const evaluateWeatherAlerts = (rule: AlertRule) => {
    const weatherCondition = rule.condition.weatherCondition || 'severe_storm'
    let shouldAlert = false
    if (weatherCondition === 'extreme_heat' && rule.condition.currentTemperature !== undefined) {
      shouldAlert = rule.condition.currentTemperature >= (rule.condition.temperatureThreshold || DEFAULT_TEMPERATURE_THRESHOLD_F)
    } else if (weatherCondition === 'high_wind' && rule.condition.currentWindSpeed !== undefined) {
      shouldAlert = rule.condition.currentWindSpeed >= (rule.condition.windSpeedThreshold || DEFAULT_WIND_SPEED_THRESHOLD_MPH)
    } else if (rule.condition.demoMode) {
      shouldAlert = Math.random() < DEMO_TRIGGER_PROBABILITY
    }
    if (!shouldAlert) return queueAutoResolve(rule.id, undefined, true)

    const details: Record<string, unknown> = { weatherCondition }
    let message = ''
    switch (weatherCondition) {
      case 'severe_storm': message = 'Severe storm warning in effect'; details.description = 'Thunderstorm with possible hail and strong winds'; break
      case 'extreme_heat': {
        const temp = rule.condition.temperatureThreshold || 100
        message = `Extreme heat alert - Temperature expected to exceed ${temp}°F`
        details.temperature = temp + 5
        details.threshold = temp
        break
      }
      case 'heavy_rain': message = 'Heavy rain warning - Flooding possible'; details.rainfall = '2-3 inches'; break
      case 'snow': message = 'Winter storm warning - Heavy snow expected'; details.snowfall = '6-12 inches'; break
      case 'high_wind': {
        const windSpeed = rule.condition.windSpeedThreshold || 40
        message = `High wind warning - Gusts up to ${windSpeed + 10} mph expected`
        details.windSpeed = windSpeed + 10
        details.threshold = windSpeed
        break
      }
    }
    createAlert(rule, message, details, undefined, undefined, 'Weather', 'WeatherCondition')
  }

  const evaluateGPUHealthCronJob = (rule: AlertRule) => {
    const cachedResults = cronJobResultsRef.current || {}
    for (const cluster of getRelevantClusters(rule)) {
      const results = cachedResults[cluster.name]
      if (!results?.length) continue
      const failedNodes = results.filter(result => result.status === 'unhealthy' || result.status === 'degraded')
      if (failedNodes.length === 0) {
        queueAutoResolve(rule.id, cluster.name)
        continue
      }
      const totalIssues = failedNodes.reduce((sum, node) => sum + (node.issues?.length || 0), 0)
      const nodeNames = failedNodes.map(node => node.nodeName).join(', ')
      createAlert(rule, `GPU health check found ${totalIssues} issue(s) on ${failedNodes.length} node(s): ${nodeNames}`, {
        failedNodes: failedNodes.length,
        totalIssues,
        nodeNames,
        checks: failedNodes.flatMap(node => (node.checks || []).filter(check => !check.passed).map(check => ({
          node: node.nodeName, check: check.name, message: check.message,
        }))),
      }, cluster.name, undefined, nodeNames, 'Node')
      dispatchBrowserNotification({
        rule,
        dedupKey: alertDedupKey(rule.id, rule.condition.type, cluster.name),
        title: `GPU Health Alert: ${cluster.name}`,
        body: `${totalIssues} issue(s) on ${failedNodes.length} GPU node(s)`,
        deepLinkParams: { drilldown: 'node', cluster: cluster.name, node: failedNodes[0].nodeName },
      })
    }
  }

  const evaluatePressure = (rule: AlertRule, issueName: 'DiskPressure' | 'MemoryPressure', title: string) => {
    for (const cluster of getRelevantClusters(rule)) {
      if (isClusterUnreachable(cluster)) {
        queueAutoResolve(rule.id, cluster.name)
        continue
      }
      const issue = (cluster.issues || []).find(value => typeof value === 'string' && value.includes(issueName))
      if (!issue) {
        queueAutoResolve(rule.id, cluster.name)
        continue
      }
      const affectedNode = issue.match(/on\s+(\S+)/)?.[1]
      createAlert(rule, `${cluster.name}: ${issue}`, {
        clusterName: cluster.name, issue, nodeCount: cluster.nodeCount, affectedNode,
      }, cluster.name, undefined, cluster.name, 'Cluster')
      dispatchBrowserNotification({
        rule,
        dedupKey: alertDedupKey(rule.id, rule.condition.type, cluster.name),
        title: `${title}: ${cluster.name}`,
        body: issue,
        deepLinkParams: affectedNode
          ? { drilldown: 'node', cluster: cluster.name, node: affectedNode, issue: issueName }
          : { drilldown: 'cluster', cluster: cluster.name, issue: issueName },
      })
    }
  }

  const evaluateDNSFailure = (rule: AlertRule) => {
    const relevantClusters = rule.condition.clusters?.length ? rule.condition.clusters : undefined
    const dnsIssues = (podIssuesRef.current || []).filter((pod: PodIssue) => {
      const isDNSPod = pod.name.includes('coredns') || pod.name.includes('dns-default')
      return isDNSPod && (!relevantClusters || relevantClusters.includes(pod.cluster || ''))
    })
    const clusterDNSIssues = new Map<string, PodIssue[]>()
    for (const pod of dnsIssues) {
      const cluster = pod.cluster || 'unknown'
      clusterDNSIssues.set(cluster, [...(clusterDNSIssues.get(cluster) || []), pod])
    }
    for (const [cluster, pods] of clusterDNSIssues) {
      const podNames = pods.map(pod => pod.name).join(', ')
      const issues = pods.flatMap(pod => pod.issues || []).join('; ')
      createAlert(rule, `${cluster}: DNS failure — ${pods.length} CoreDNS pod(s) unhealthy`, { clusterName: cluster, podNames, issues, podCount: pods.length }, cluster, 'kube-system', podNames, 'Pod')
      dispatchBrowserNotification({
        rule,
        dedupKey: alertDedupKey(rule.id, rule.condition.type, cluster),
        title: `DNS Failure: ${cluster}`,
        body: `${pods.length} CoreDNS pod(s) unhealthy — ${issues || 'check pod status'}`,
        deepLinkParams: { drilldown: 'pod', cluster, namespace: pods[0].namespace, pod: pods[0].name },
      })
    }
    const clustersWithIssues = new Set(clusterDNSIssues.keys())
    for (const alert of (alertsRef.current || [])) {
      if (alert.ruleId === rule.id && alert.status === 'firing' && alert.cluster && !clustersWithIssues.has(alert.cluster)) {
        queueAutoResolve(rule.id, alert.cluster)
      }
    }
  }

  const evaluateCertificateError = (rule: AlertRule) => {
    for (const cluster of getRelevantClusters(rule)) {
      if (cluster.errorType !== 'certificate') {
        deleteNotifiedKey(alertDedupKey(rule.id, rule.condition.type, cluster.name))
        queueAutoResolve(rule.id, cluster.name)
        continue
      }
      createAlert(rule, `${cluster.name}: Certificate error — ${cluster.errorMessage || 'TLS handshake failed'}`, {
        clusterName: cluster.name, errorType: cluster.errorType, errorMessage: cluster.errorMessage, server: cluster.server,
      }, cluster.name, undefined, cluster.name, 'Cluster')
      dispatchBrowserNotification({
        rule,
        dedupKey: alertDedupKey(rule.id, rule.condition.type, cluster.name),
        title: `Certificate Error: ${cluster.name}`,
        body: cluster.errorMessage || 'TLS certificate validation failed',
        deepLinkParams: { drilldown: 'cluster', cluster: cluster.name, issue: 'certificate' },
      })
    }
  }

  const evaluateClusterUnreachable = (rule: AlertRule) => {
    for (const cluster of getRelevantClusters(rule)) {
      if (cluster.reachable !== false) {
        deleteNotifiedKey(alertDedupKey(rule.id, rule.condition.type, cluster.name))
        queueAutoResolve(rule.id, cluster.name)
        continue
      }
      if (cluster.errorType === 'certificate') continue
      const errorLabel = cluster.errorType === 'timeout'
        ? 'connection timed out'
        : cluster.errorType === 'auth'
          ? 'authentication failed'
          : cluster.errorType === 'network'
            ? 'network unreachable'
            : 'connection failed'
      createAlert(rule, `${cluster.name}: Cluster unreachable — ${errorLabel}`, {
        clusterName: cluster.name,
        errorType: cluster.errorType,
        errorMessage: cluster.errorMessage,
        server: cluster.server,
        lastSeen: cluster.lastSeen,
      }, cluster.name, undefined, cluster.name, 'Cluster')
      dispatchBrowserNotification({
        rule,
        dedupKey: alertDedupKey(rule.id, rule.condition.type, cluster.name),
        title: `Cluster Unreachable: ${cluster.name}`,
        body: `${errorLabel}${cluster.lastSeen ? ` — last seen ${cluster.lastSeen}` : ''}`,
        deepLinkParams: { drilldown: 'cluster', cluster: cluster.name, issue: 'unreachable' },
      })
    }
  }

  const evaluateNightlyE2EFailure = (rule: AlertRule) => {
    const guides = nightlyE2ERef.current || []
    if (!guides.length) return
    const currentRunIds = new Set<number>()
    for (const guide of guides) {
      for (const run of (guide.runs || [])) {
        currentRunIds.add(run.id)
        if (run.status !== 'completed' || run.conclusion !== 'failure' || nightlyAlertedRunsRef.current.has(run.id)) continue
        nightlyAlertedRunsRef.current.add(run.id)
        createAlert(rule, `Nightly E2E failed: ${guide.guide} (${guide.acronym}) on ${guide.platform} — Run #${run.runNumber}`, {
          guide: guide.guide,
          acronym: guide.acronym,
          platform: guide.platform,
          repo: guide.repo,
          workflowFile: guide.workflowFile,
          runNumber: run.runNumber,
          runId: run.id,
          htmlUrl: run.htmlUrl,
          failureReason: run.failureReason || 'unknown',
          model: run.model,
          gpuType: run.gpuType,
          gpuCount: run.gpuCount,
        }, guide.platform, undefined, `${guide.acronym}-run-${run.runNumber}`, 'WorkflowRun')
        dispatchBrowserNotification({
          rule,
          dedupKey: `${rule.id}::${guide.acronym}::${run.runNumber}`,
          title: `Nightly E2E Failed: ${guide.acronym} (${guide.platform})`,
          body: `Run #${run.runNumber} failed — ${guide.guide}`,
          deepLinkParams: { card: 'nightly_e2e_status' },
        })
      }
    }
    for (const id of nightlyAlertedRunsRef.current) {
      if (!currentRunIds.has(id)) nightlyAlertedRunsRef.current.delete(id)
    }
  }

  const evaluators: Record<string, (rule: AlertRule) => void> = {
    gpu_usage: evaluateGPUUsage,
    gpu_health_cronjob: evaluateGPUHealthCronJob,
    node_not_ready: evaluateNodeReady,
    pod_crash: evaluatePodCrash,
    disk_pressure: rule => evaluatePressure(rule, 'DiskPressure', 'Disk Pressure'),
    memory_pressure: rule => evaluatePressure(rule, 'MemoryPressure', 'Memory Pressure'),
    weather_alerts: evaluateWeatherAlerts,
    nightly_e2e_failure: evaluateNightlyE2EFailure,
    dns_failure: evaluateDNSFailure,
    certificate_error: evaluateCertificateError,
    cluster_unreachable: evaluateClusterUnreachable,
  }

  const evaluateConditions = () => {
    if (isEvaluatingRef.current) return
    isEvaluatingRef.current = true
    setIsEvaluating(true)
    const acc: MutationAccumulator = { mutations: [], notifications: [] }
    mutationAccRef.current = acc
    try {
      for (const rule of (rulesRef.current || []).filter(candidate => candidate.enabled)) {
        evaluators[rule.condition.type]?.(rule)
      }
      const currentClusterNames = new Set((clustersRef.current || []).map(cluster => cluster.name))
      for (const alert of (alertsRef.current || [])) {
        if (alert.status === 'firing' && alert.cluster && currentClusterNames.size > 0 && !currentClusterNames.has(alert.cluster)) {
          queueAutoResolve(alert.ruleId, alert.cluster)
        }
      }
    } finally {
      mutationAccRef.current = null
      if (acc.mutations.length > 0) setAlerts(prev => applyMutations(prev, acc.mutations, rulesRef.current))
      if (acc.notifications.length > 0) queueBatchedNotifications(acc.notifications)
      persistNotifiedAlertKeys()
      isEvaluatingRef.current = false
      setIsEvaluating(false)
    }
  }

  return { evaluateConditions }
}
