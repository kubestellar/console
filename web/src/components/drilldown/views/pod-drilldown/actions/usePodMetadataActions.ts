import { useCallback, useState, type Dispatch, type SetStateAction } from 'react'
import { useTranslation } from 'react-i18next'
import type { PodMetadataActionProps } from './types'

const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

export function usePodMetadataActions({
  cluster,
  namespace,
  podName,
  agentConnected,
  labels,
  annotations,
  openTrackedWs,
  parseWsMessage,
}: PodMetadataActionProps) {
  const { t } = useTranslation()

  const [editingLabels, setEditingLabels] = useState(false)
  const [pendingLabelChanges, setPendingLabelChanges] = useState<Record<string, string | null>>({})
  const [newLabelKey, setNewLabelKey] = useState('')
  const [newLabelValue, setNewLabelValue] = useState('')
  const [labelSaving, setLabelSaving] = useState(false)
  const [labelError, setLabelError] = useState<string | null>(null)

  const [editingAnnotations, setEditingAnnotations] = useState(false)
  const [pendingAnnotationChanges, setPendingAnnotationChanges] = useState<Record<string, string | null>>({})
  const [newAnnotationKey, setNewAnnotationKey] = useState('')
  const [newAnnotationValue, setNewAnnotationValue] = useState('')
  const [annotationSaving, setAnnotationSaving] = useState(false)
  const [annotationError, setAnnotationError] = useState<string | null>(null)

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
              payload: { context: cluster, args },
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
              payload: { context: cluster, args },
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
  }
}
