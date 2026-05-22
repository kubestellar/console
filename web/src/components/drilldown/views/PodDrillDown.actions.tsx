import { useState, useEffect, useCallback, type Dispatch, type SetStateAction } from 'react'
import { useMissions } from '../../../hooks/useMissions'
import { useDrillDown } from '../../../hooks/useDrillDown'
import { useCanI } from '../../../hooks/usePermissions'
import { useToast } from '../../ui/Toast'
import { useTranslation } from 'react-i18next'
import type { RelatedResource } from './pod-drilldown'

const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

interface UsePodActionsProps {
  cluster: string
  namespace: string
  podName: string
  status: string
  restarts: number
  issues: string[]
  agentConnected: boolean
  backendActionUnavailable: boolean
  backendUnavailableMessage: string
  labels: Record<string, string> | null
  annotations: Record<string, string> | null
  ownerChain: RelatedResource[]
  openTrackedWs: () => Promise<WebSocket>
  parseWsMessage: (event: MessageEvent, context: string) => any
}

export function usePodActions({
  cluster,
  namespace,
  podName,
  status,
  restarts,
  issues,
  agentConnected,
  backendActionUnavailable,
  backendUnavailableMessage,
  labels,
  annotations,
  ownerChain,
  openTrackedWs,
  parseWsMessage,
}: UsePodActionsProps) {
  const { t } = useTranslation()
  const { startMission } = useMissions()
  const { close: closeDrillDown } = useDrillDown()
  const { checkPermission } = useCanI()
  const { showToast } = useToast()

  // Delete pod state
  const [canDeletePod, setCanDeletePod] = useState<boolean | null>(null)
  const [deletingPod, setDeletingPod] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [showDeletePodConfirm, setShowDeletePodConfirm] = useState(false)

  // Label editing state
  const [editingLabels, setEditingLabels] = useState(false)
  const [pendingLabelChanges, setPendingLabelChanges] = useState<Record<string, string | null>>({})
  const [newLabelKey, setNewLabelKey] = useState('')
  const [newLabelValue, setNewLabelValue] = useState('')
  const [labelSaving, setLabelSaving] = useState(false)
  const [labelError, setLabelError] = useState<string | null>(null)

  // Annotation editing state
  const [editingAnnotations, setEditingAnnotations] = useState(false)
  const [pendingAnnotationChanges, setPendingAnnotationChanges] = useState<Record<string, string | null>>({})
  const [newAnnotationKey, setNewAnnotationKey] = useState('')
  const [newAnnotationValue, setNewAnnotationValue] = useState('')
  const [annotationSaving, setAnnotationSaving] = useState(false)
  const [annotationError, setAnnotationError] = useState<string | null>(null)

  // Related resources state
  const [relatedResources, setRelatedResources] = useState<RelatedResource[]>([])
  const [relatedLoading, setRelatedLoading] = useState(false)
  const [configMaps, setConfigMaps] = useState<string[]>([])
  const [secrets, setSecrets] = useState<string[]>([])
  const [pvcs, setPvcs] = useState<string[]>([])
  const [serviceAccount, setServiceAccount] = useState<string | null>(null)

  // Check delete permission
  useEffect(() => {
    let cancelled = false

    const run = async () => {
      if (backendActionUnavailable) {
        if (!cancelled) setCanDeletePod(false)
        return
      }
      try {
        const result = await checkPermission({
          cluster,
          verb: 'delete',
          resource: 'pods',
          namespace,
        })
        if (!cancelled) setCanDeletePod(result.allowed)
      } catch {
        if (!cancelled) setCanDeletePod(false)
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [backendActionUnavailable, cluster, namespace, checkPermission])

  // Check if pod is managed by a controller
  const isManagedPod = ownerChain.some(owner =>
    ['ReplicaSet', 'Deployment', 'StatefulSet', 'DaemonSet', 'Job'].includes(owner.kind)
  )

  // Repair pod action
  const handleRepairPod = useCallback((checkKeyAndRun: (fn: () => void) => void) => {
    if (backendActionUnavailable) {
      showToast(backendUnavailableMessage, 'error')
      return
    }
    checkKeyAndRun(() => {
      closeDrillDown()
      startMission({
        title: `Repair Pod ${podName}`,
        description: `Diagnose and fix issues with pod ${podName}`,
        type: 'repair',
        cluster,
        initialPrompt: `I need help diagnosing and repairing issues with pod "${podName}" in namespace "${namespace}" on cluster "${cluster}".

Current Status: ${status}
Restarts: ${restarts}
${issues.length > 0 ? `Issues: ${issues.join(', ')}` : ''}

Please:
1. Investigate the root cause — check pod logs, events, and configuration.
2. Tell me what you found, then ask:
   - "Should I apply the fix?"
   - "Show me more details first"
3. If I say fix it, apply and verify. Then ask:
   - "Should I check for related issues?"
   - "All done"`,
        context: {
          podName,
          namespace,
          cluster,
          status,
          restarts,
          issues
        }
      })
    })
  }, [backendActionUnavailable, backendUnavailableMessage, showToast, closeDrillDown, startMission, podName, namespace, cluster, status, restarts, issues])

  // Delete pod action
  const handleDeletePod = useCallback(async () => {
    if (backendActionUnavailable) {
      setDeleteError(backendUnavailableMessage)
      showToast(backendUnavailableMessage, 'error')
      return
    }
    if (!agentConnected || !canDeletePod) return

    setDeletingPod(true)
    setDeleteError(null)

    try {
      const ws = await openTrackedWs()
      const requestId = `delete-pod-${Date.now()}`

      ws.onopen = () => {
        ws.send(JSON.stringify({
          id: requestId,
          type: 'kubectl',
          payload: { context: cluster, args: ['delete', 'pod', podName, '-n', namespace] }
        }))
      }

      ws.onmessage = (event: MessageEvent) => {
        const msg = parseWsMessage(event, 'delete pod')
        if (!msg) {
          setDeleteError(t('drilldown.errors.failedToParseResponse'))
          setDeletingPod(false)
          ws.close()
          return
        }

        if (msg.id === requestId) {
          if (msg.type === 'error' || msg.payload?.exitCode !== 0) {
            setDeleteError(msg.payload?.error || t('drilldown.errors.failedToDeletePod'))
          } else {
            showToast(t('drilldown.success.podDeleted', { name: podName }), 'success')
            closeDrillDown()
          }
        }
        ws.close()
        setDeletingPod(false)
      }

      ws.onerror = () => {
        setDeleteError('Connection error')
        setDeletingPod(false)
        ws.close()
      }
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : 'Unknown error')
      setDeletingPod(false)
    }
  }, [backendActionUnavailable, backendUnavailableMessage, showToast, agentConnected, canDeletePod, openTrackedWs, parseWsMessage, cluster, podName, namespace, closeDrillDown, t])

  // Save labels
  const saveLabels = useCallback(async (setLabels: Dispatch<SetStateAction<Record<string, string> | null>>) => {
    if (!agentConnected) return
    setLabelSaving(true)
    setLabelError(null)

    try {
      const runKubectl = async (args: string[]): Promise<{ success: boolean; error?: string }> => {
        const ws = await openTrackedWs()
        return new Promise((resolve) => {
          const requestId = `label-${Date.now()}-${Math.random().toString(36).slice(2)}`

          const timeout = setTimeout(() => {
            ws.close()
            resolve({ success: false, error: 'Command timed out' })
          }, 10000)

          ws.onopen = () => {
            ws.send(JSON.stringify({
              id: requestId,
              type: 'kubectl',
              payload: { context: cluster, args }
            }))
          }
          ws.onmessage = (event: MessageEvent) => {
            const msg = parseWsMessage(event, 'save labels')
            if (!msg) {
              clearTimeout(timeout)
              ws.close()
              resolve({ success: false, error: t('drilldown.errors.failedToParseResponse') })
              return
            }

            if (msg.id === requestId) {
              clearTimeout(timeout)
              ws.close()
              if (msg.payload?.exitCode === 0 || msg.payload?.output) {
                resolve({ success: true })
              } else {
                resolve({ success: false, error: msg.payload?.error || 'Unknown error' })
              }
            }
          }
          ws.onerror = () => {
            clearTimeout(timeout)
            ws.close()
            resolve({ success: false, error: 'Connection failed' })
          }
        })
      }

      const labelArgs: string[] = ['label', 'pod', podName, '-n', namespace, '--overwrite']

      if (newLabelKey.trim() && newLabelValue.trim()) {
        labelArgs.push(`${newLabelKey.trim()}=${newLabelValue.trim()}`)
      }

      for (const [key, value] of Object.entries(pendingLabelChanges)) {
        if (value === null) {
          labelArgs.push(`${key}-`)
        } else if (value !== labels?.[key]) {
          labelArgs.push(`${key}=${value}`)
        }
      }

      if (labelArgs.length > 5) {
        const result = await runKubectl(labelArgs)
        if (!result.success) {
          setLabelError(result.error || t('drilldown.errors.failedToSaveLabels'))
          setLabelSaving(false)
          return
        }
      }

      setLabels(prev => {
        const updated = { ...prev }
        for (const [key, value] of Object.entries(pendingLabelChanges)) {
          if (UNSAFE_KEYS.has(key)) continue
          if (value === null) {
            delete updated[key]
          } else {
            updated[key] = value
          }
        }
        if (newLabelKey.trim() && newLabelValue.trim() && !UNSAFE_KEYS.has(newLabelKey.trim())) {
          updated[newLabelKey.trim()] = newLabelValue.trim()
        }
        return updated
      })

      setEditingLabels(false)
      setPendingLabelChanges({})
      setNewLabelKey('')
      setNewLabelValue('')
    } catch (err: unknown) {
      setLabelError(`Failed to save: ${err}`)
    } finally {
      setLabelSaving(false)
    }
  }, [agentConnected, openTrackedWs, parseWsMessage, cluster, podName, namespace, newLabelKey, newLabelValue, pendingLabelChanges, labels, t])

  // Save annotations
  const saveAnnotations = useCallback(async (setAnnotations: Dispatch<SetStateAction<Record<string, string> | null>>) => {
    if (!agentConnected) return
    setAnnotationSaving(true)
    setAnnotationError(null)

    try {
      const runKubectl = async (args: string[]): Promise<{ success: boolean; error?: string }> => {
        const ws = await openTrackedWs()
        return new Promise((resolve) => {
          const requestId = `annotate-${Date.now()}-${Math.random().toString(36).slice(2)}`

          const timeout = setTimeout(() => {
            ws.close()
            resolve({ success: false, error: 'Command timed out' })
          }, 10000)

          ws.onopen = () => {
            ws.send(JSON.stringify({
              id: requestId,
              type: 'kubectl',
              payload: { context: cluster, args }
            }))
          }
          ws.onmessage = (event: MessageEvent) => {
            const msg = parseWsMessage(event, 'save annotations')
            if (!msg) {
              clearTimeout(timeout)
              ws.close()
              resolve({ success: false, error: t('drilldown.errors.failedToParseResponse') })
              return
            }

            if (msg.id === requestId) {
              clearTimeout(timeout)
              ws.close()
              if (msg.payload?.exitCode === 0 || msg.payload?.output) {
                resolve({ success: true })
              } else {
                resolve({ success: false, error: msg.payload?.error || 'Unknown error' })
              }
            }
          }
          ws.onerror = () => {
            clearTimeout(timeout)
            ws.close()
            resolve({ success: false, error: 'Connection failed' })
          }
        })
      }

      const annotationArgs: string[] = ['annotate', 'pod', podName, '-n', namespace, '--overwrite']

      if (newAnnotationKey.trim() && newAnnotationValue.trim()) {
        annotationArgs.push(`${newAnnotationKey.trim()}=${newAnnotationValue.trim()}`)
      }

      for (const [key, value] of Object.entries(pendingAnnotationChanges)) {
        if (value === null) {
          annotationArgs.push(`${key}-`)
        } else if (value !== annotations?.[key]) {
          annotationArgs.push(`${key}=${value}`)
        }
      }

      if (annotationArgs.length > 5) {
        const result = await runKubectl(annotationArgs)
        if (!result.success) {
          setAnnotationError(result.error || t('drilldown.errors.failedToSaveAnnotations'))
          setAnnotationSaving(false)
          return
        }
      }

      setAnnotations(prev => {
        const updated = { ...prev }
        for (const [key, value] of Object.entries(pendingAnnotationChanges)) {
          if (UNSAFE_KEYS.has(key)) continue
          if (value === null) {
            delete updated[key]
          } else {
            updated[key] = value
          }
        }
        if (newAnnotationKey.trim() && newAnnotationValue.trim() && !UNSAFE_KEYS.has(newAnnotationKey.trim())) {
          updated[newAnnotationKey.trim()] = newAnnotationValue.trim()
        }
        return updated
      })

      setEditingAnnotations(false)
      setPendingAnnotationChanges({})
      setNewAnnotationKey('')
      setNewAnnotationValue('')
    } catch (err: unknown) {
      setAnnotationError(`Failed to save: ${err}`)
    } finally {
      setAnnotationSaving(false)
    }
  }, [agentConnected, openTrackedWs, parseWsMessage, cluster, podName, namespace, newAnnotationKey, newAnnotationValue, pendingAnnotationChanges, annotations, t])

  // Fetch related resources
  const fetchRelatedResources = useCallback(async (force = false) => {
    if (!agentConnected || (!force && relatedResources.length > 0)) return
    setRelatedLoading(true)

    try {
      const runKubectl = async (args: string[]): Promise<string> => {
        const ws = await openTrackedWs()
        return new Promise((resolve) => {
          const requestId = `related-${Date.now()}-${Math.random().toString(36).slice(2)}`
          let output = ''

          const timeout = setTimeout(() => {
            ws.close()
            resolve(output || '')
          }, 10000)

          ws.onopen = () => {
            ws.send(JSON.stringify({
              id: requestId,
              type: 'kubectl',
              payload: { context: cluster, args }
            }))
          }
          ws.onmessage = (event: MessageEvent) => {
            const msg = parseWsMessage(event, 'related resources')
            if (!msg) {
              clearTimeout(timeout)
              ws.close()
              resolve(output)
              return
            }

            if (msg.id === requestId && msg.payload?.output) {
              output = msg.payload.output
            }
            clearTimeout(timeout)
            ws.close()
            resolve(output)
          }
          ws.onerror = () => {
            clearTimeout(timeout)
            ws.close()
            resolve(output || '')
          }
        })
      }

      const podYaml = await runKubectl(['get', 'pod', podName, '-n', namespace, '-o', 'yaml'])

      // Extract service account
      const saMatch = podYaml.match(/serviceAccountName:\s*(\S+)/)
      if (saMatch) {
        setServiceAccount(saMatch[1])
      }

      // Extract configmap references
      const configMapRefs = new Set<string>()
      const configMapMatches = podYaml.matchAll(/configMapName:\s*(\S+)|name:\s*(\S+)\s*\n\s*configMap:/g)
      for (const match of configMapMatches) {
        const name = match[1] || match[2]
        if (name) configMapRefs.add(name)
      }
      const envFromConfigMaps = podYaml.matchAll(/configMapRef:\s*\n\s*name:\s*(\S+)/g)
      for (const match of envFromConfigMaps) {
        if (match[1]) configMapRefs.add(match[1])
      }
      setConfigMaps(Array.from(configMapRefs))

      // Extract secret references
      const secretRefs = new Set<string>()
      const secretMatches = podYaml.matchAll(/secretName:\s*(\S+)/g)
      for (const match of secretMatches) {
        if (match[1]) secretRefs.add(match[1])
      }
      const envFromSecrets = podYaml.matchAll(/secretRef:\s*\n\s*name:\s*(\S+)/g)
      for (const match of envFromSecrets) {
        if (match[1]) secretRefs.add(match[1])
      }
      setSecrets(Array.from(secretRefs))

      // Extract PVC references
      const K8S_NAME_PATTERN = '[a-z0-9][a-z0-9._-]*[a-z0-9]|[a-z0-9]'
      const pvcRefs = new Set<string>()
      const pvcMatches = podYaml.matchAll(new RegExp(`claimName:\\s*"?(${K8S_NAME_PATTERN})"?`, 'g'))
      for (const match of pvcMatches) {
        if (match[1]) pvcRefs.add(match[1])
      }
      setPvcs(Array.from(pvcRefs))

      // Build owner chain
      const chain: RelatedResource[] = []
      const ownerRefMatch = podYaml.match(/ownerReferences:[\s\S]*?kind:\s*(\w+)[\s\S]*?name:\s*([\w-]+)/)
      if (ownerRefMatch) {
        const ownerKind = ownerRefMatch[1]
        const ownerName = ownerRefMatch[2]
        chain.push({ kind: ownerKind, name: ownerName, namespace })

        if (ownerKind === 'ReplicaSet') {
          const rsYaml = await runKubectl(['get', 'replicaset', ownerName, '-n', namespace, '-o', 'yaml'])
          const rsOwnerMatch = rsYaml.match(/ownerReferences:[\s\S]*?kind:\s*(\w+)[\s\S]*?name:\s*([\w-]+)/)
          if (rsOwnerMatch) {
            chain.push({ kind: rsOwnerMatch[1], name: rsOwnerMatch[2], namespace })
          }
        }
      }
      setRelatedResources(chain)
    } catch {
      // Ignore errors
    } finally {
      setRelatedLoading(false)
    }
  }, [agentConnected, relatedResources.length, openTrackedWs, parseWsMessage, cluster, podName, namespace])

  // Label change handlers
  const handleLabelChange = (key: string, value: string) => {
    if (UNSAFE_KEYS.has(key)) return
    setPendingLabelChanges(prev => ({ ...prev, [key]: value }))
  }

  const handleLabelRemove = (key: string) => {
    if (UNSAFE_KEYS.has(key)) return
    setPendingLabelChanges(prev => ({ ...prev, [key]: null }))
  }

  const undoLabelChange = (key: string) => {
    if (UNSAFE_KEYS.has(key)) return
    setPendingLabelChanges(prev => {
      const updated = { ...prev }
      delete updated[key]
      return updated
    })
  }

  const cancelLabelEdit = () => {
    setEditingLabels(false)
    setPendingLabelChanges({})
    setNewLabelKey('')
    setNewLabelValue('')
    setLabelError(null)
  }

  // Annotation change handlers
  const handleAnnotationChange = (key: string, value: string) => {
    if (UNSAFE_KEYS.has(key)) return
    setPendingAnnotationChanges(prev => ({ ...prev, [key]: value }))
  }

  const handleAnnotationRemove = (key: string) => {
    if (UNSAFE_KEYS.has(key)) return
    setPendingAnnotationChanges(prev => ({ ...prev, [key]: null }))
  }

  const undoAnnotationChange = (key: string) => {
    if (UNSAFE_KEYS.has(key)) return
    setPendingAnnotationChanges(prev => {
      const updated = { ...prev }
      delete updated[key]
      return updated
    })
  }

  const cancelAnnotationEdit = () => {
    setEditingAnnotations(false)
    setPendingAnnotationChanges({})
    setNewAnnotationKey('')
    setNewAnnotationValue('')
    setAnnotationError(null)
  }

  return {
    // Delete pod
    canDeletePod,
    deletingPod,
    deleteError,
    showDeletePodConfirm,
    setShowDeletePodConfirm,
    handleDeletePod,
    isManagedPod,
    
    // Repair pod
    handleRepairPod,
    
    // Labels
    editingLabels,
    setEditingLabels,
    pendingLabelChanges,
    newLabelKey,
    setNewLabelKey,
    newLabelValue,
    setNewLabelValue,
    labelSaving,
    labelError,
    saveLabels,
    handleLabelChange,
    handleLabelRemove,
    undoLabelChange,
    cancelLabelEdit,
    
    // Annotations
    editingAnnotations,
    setEditingAnnotations,
    pendingAnnotationChanges,
    newAnnotationKey,
    setNewAnnotationKey,
    newAnnotationValue,
    setNewAnnotationValue,
    annotationSaving,
    annotationError,
    saveAnnotations,
    handleAnnotationChange,
    handleAnnotationRemove,
    undoAnnotationChange,
    cancelAnnotationEdit,
    
    // Related resources
    relatedResources,
    relatedLoading,
    configMaps,
    secrets,
    pvcs,
    serviceAccount,
    fetchRelatedResources,
  }
}
