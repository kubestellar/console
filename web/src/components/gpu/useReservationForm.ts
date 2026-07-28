import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  useNamespaces,
  createOrUpdateResourceQuota,
  deleteResourceQuota,
  COMMON_RESOURCE_TYPES,
} from '../../hooks/useMCP'
import type { CreateGPUReservationInput, UpdateGPUReservationInput } from '../../hooks/useGPUReservations'
import { normalizeGpuTypes } from '../../hooks/useGPUReservations'
import type {
  ClusterGPUTypeAvailability,
  ExtraResourceLimit,
  NamespaceFieldState,
  ReservationFormModalProps,
} from './ReservationFormModal.types'

const GPU_KEYS = ['nvidia.com/gpu', 'amd.com/gpu', 'gpu.intel.com/i915']
const QUOTA_NAME_TITLE_MAX_LEN = 40
const DEFAULT_RESERVATION_DURATION_HOURS = 24
const FILTERED_NS_PREFIXES = ['openshift-', 'kube-']
const FILTERED_NS_EXACT = ['default', 'kube-system', 'kube-public', 'kube-node-lease']

function toDateInputValue(value: string | undefined | null): string {
  if (!value) return ''
  return value.split('T')[0]
}

function toRFC3339StartDate(value: string): string {
  if (!value) return ''
  if (value.includes('T')) return value

  const offsetMinutesWestOfUTC = new Date().getTimezoneOffset()
  const totalOffsetMinutes = -offsetMinutesWestOfUTC
  const offsetSign = totalOffsetMinutes >= 0 ? '+' : '-'
  const absoluteOffsetMinutes = Math.abs(totalOffsetMinutes)
  const minutesPerHour = 60
  const offsetHours = String(Math.floor(absoluteOffsetMinutes / minutesPerHour)).padStart(2, '0')
  const offsetMinutes = String(absoluteOffsetMinutes % minutesPerHour).padStart(2, '0')

  return `${value}T00:00:00${offsetSign}${offsetHours}:${offsetMinutes}`
}

function deriveQuotaName(title: string): string {
  if (!title) return ''
  return `gpu-${title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, QUOTA_NAME_TITLE_MAX_LEN)}`
}

export function useReservationForm({
  editingReservation,
  gpuClusters,
  allNodes,
  prefillDate,
  forceLive,
  knownNamespacesByCluster,
  onClose,
  onSave,
  onActivate,
  onSaved,
  onError,
}: ReservationFormModalProps) {
  const { t } = useTranslation(['cards', 'common'])

  const [cluster, setCluster] = useState(editingReservation?.cluster || '')
  const [nsField, setNsField] = useState<NamespaceFieldState>({
    value: editingReservation?.namespace || '',
    isNew: false,
  })
  const namespace = nsField.value
  const isNewNamespace = nsField.isNew
  const [title, setTitle] = useState(editingReservation?.title || '')
  const [description, setDescription] = useState(editingReservation?.description || '')
  const [gpuCount, setGpuCount] = useState(editingReservation ? String(editingReservation.gpu_count) : '')
  const [gpuPreferences, setGpuPreferences] = useState<string[]>(() => normalizeGpuTypes(editingReservation))
  const [startDate, setStartDate] = useState(
    toDateInputValue(editingReservation?.start_date) || prefillDate || new Date().toISOString().split('T')[0],
  )
  const [durationHours, setDurationHours] = useState(editingReservation ? String(editingReservation.duration_hours) : '')
  const [notes, setNotes] = useState(editingReservation?.notes || '')
  const enforceQuota = true
  const [extraResources, setExtraResources] = useState<ExtraResourceLimit[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false)

  const initialSnapshot = useMemo(
    () => ({
      cluster: editingReservation?.cluster || '',
      namespace: editingReservation?.namespace || '',
      title: editingReservation?.title || '',
      description: editingReservation?.description || '',
      gpuCount: editingReservation ? String(editingReservation.gpu_count) : '',
      gpuPreferences: [...normalizeGpuTypes(editingReservation)].sort(),
      startDate: toDateInputValue(editingReservation?.start_date) || prefillDate || new Date().toISOString().split('T')[0],
      durationHours: editingReservation ? String(editingReservation.duration_hours) : '',
      notes: editingReservation?.notes || '',
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editingReservation?.id, prefillDate],
  )

  const {
    namespaces: rawNamespaces,
    isLoading: namespacesLoading,
    error: namespacesError,
    refetch: refetchNamespaces,
  } = useNamespaces(cluster || undefined, forceLive)

  const mergedRawNamespaces = useMemo(() => {
    const knownForCluster = (cluster && knownNamespacesByCluster?.[cluster]) || []
    if (knownForCluster.length === 0) return rawNamespaces
    return Array.from(new Set<string>([...rawNamespaces, ...knownForCluster])).sort()
  }, [rawNamespaces, cluster, knownNamespacesByCluster])

  const clusterNamespaces = mergedRawNamespaces.filter(ns =>
    !FILTERED_NS_PREFIXES.some(prefix => ns.startsWith(prefix)) && !FILTERED_NS_EXACT.includes(ns),
  )

  const selectedClusterInfo = gpuClusters.find(c => c.name === cluster)
  const maxGPUs = selectedClusterInfo?.availableGPUs ?? 0

  const gpuResourceKey = (() => {
    if (!cluster) return 'limits.nvidia.com/gpu'
    const clusterNodes = allNodes.filter(n => n.cluster === cluster)
    const hasAMD = clusterNodes.some(n => n.gpuType.toLowerCase().includes('amd') || n.manufacturer?.toLowerCase().includes('amd'))
    const hasIntel = clusterNodes.some(n => n.gpuType.toLowerCase().includes('intel') || n.manufacturer?.toLowerCase().includes('intel'))
    if (hasAMD) return 'limits.amd.com/gpu'
    if (hasIntel) return 'gpu.intel.com/i915'
    return 'limits.nvidia.com/gpu'
  })()

  const clusterGPUTypes: ClusterGPUTypeAvailability[] = (() => {
    if (!cluster) return []
    const typeMap: Record<string, { total: number; allocated: number }> = {}
    for (const n of allNodes.filter(n => n.cluster === cluster)) {
      if (!typeMap[n.gpuType]) typeMap[n.gpuType] = { total: 0, allocated: 0 }
      typeMap[n.gpuType].total += n.gpuCount
      typeMap[n.gpuType].allocated += n.gpuAllocated
    }
    return Object.entries(typeMap).map(([type, d]) => ({
      type,
      total: d.total,
      available: d.total - d.allocated,
    }))
  })()

  const quotaName = deriveQuotaName(title)
  const originalQuotaName = deriveQuotaName(editingReservation?.title || '')
  const additionalResourceTypes = COMMON_RESOURCE_TYPES.filter(rt => !GPU_KEYS.some(gk => rt.key.includes(gk)))

  const isDirty = (): boolean => {
    if (cluster !== initialSnapshot.cluster) return true
    if (namespace !== initialSnapshot.namespace) return true
    if (title !== initialSnapshot.title) return true
    if (description !== initialSnapshot.description) return true
    if (gpuCount !== initialSnapshot.gpuCount) return true
    const currentGpuPrefSorted = [...gpuPreferences].sort()
    if (currentGpuPrefSorted.length !== initialSnapshot.gpuPreferences.length) return true
    for (let i = 0; i < currentGpuPrefSorted.length; i++) {
      if (currentGpuPrefSorted[i] !== initialSnapshot.gpuPreferences[i]) return true
    }
    if (startDate !== initialSnapshot.startDate) return true
    if (durationHours !== initialSnapshot.durationHours) return true
    if (notes !== initialSnapshot.notes) return true
    if (extraResources.length > 0) return true
    return false
  }

  const forceClose = () => {
    setShowDiscardConfirm(false)
    onClose()
  }

  const handleClose = () => {
    if (isDirty()) {
      setShowDiscardConfirm(true)
      return
    }
    onClose()
  }

  const handleClusterChange = (nextCluster: string) => {
    setCluster(nextCluster)
    setNsField({ value: '', isNew: false })
    setGpuPreferences([])
  }

  const handleSave = async () => {
    const count = parseInt(gpuCount)
    const originalCount = editingReservation?.gpu_count ?? 0
    const sameClusterAsOriginal = editingReservation ? cluster === editingReservation.cluster : true
    const capacityCeiling = editingReservation && sameClusterAsOriginal ? maxGPUs + originalCount : maxGPUs
    const validationError = !cluster
      ? t('gpuReservations.form.errors.selectCluster')
      : !namespace
      ? t('gpuReservations.form.errors.selectNamespace')
      : !title
      ? t('gpuReservations.form.errors.titleRequired')
      : !count || count < 1
      ? t('gpuReservations.form.errors.gpuCountMin')
      : count > capacityCeiling
      ? t('gpuReservations.form.errors.gpuCountMax', { max: capacityCeiling, cluster })
      : null
    setError(validationError)
    if (validationError) return

    setIsSaving(true)
    try {
      let reservationId: string | void
      const rfc3339StartDate = toRFC3339StartDate(startDate)
      const gpuTypesList =
        gpuPreferences.length > 0
          ? gpuPreferences
          : clusterGPUTypes.length === 1 && clusterGPUTypes[0]?.type
          ? [clusterGPUTypes[0].type]
          : []
      const primaryGpuType = gpuTypesList[0] || ''
      if (editingReservation) {
        const input: UpdateGPUReservationInput = {
          title,
          description,
          cluster,
          namespace,
          gpu_count: count,
          gpu_type: primaryGpuType,
          gpu_types: gpuTypesList,
          start_date: rfc3339StartDate,
          duration_hours: parseInt(durationHours) || DEFAULT_RESERVATION_DURATION_HOURS,
          notes,
          quota_enforced: enforceQuota,
          quota_name: enforceQuota ? quotaName : '',
          max_cluster_gpus: selectedClusterInfo?.totalGPUs,
        }
        reservationId = await onSave(input)
      } else {
        const input: CreateGPUReservationInput = {
          title,
          description,
          cluster,
          namespace,
          gpu_count: count,
          gpu_type: primaryGpuType,
          gpu_types: gpuTypesList,
          start_date: rfc3339StartDate,
          duration_hours: parseInt(durationHours) || DEFAULT_RESERVATION_DURATION_HOURS,
          notes,
          quota_enforced: enforceQuota,
          quota_name: enforceQuota ? quotaName : '',
          max_cluster_gpus: selectedClusterInfo?.totalGPUs,
        }
        reservationId = await onSave(input)
      }

      if (enforceQuota) {
        try {
          const hard: Record<string, string> = {
            [gpuResourceKey]: String(count),
          }
          for (const r of extraResources) {
            if (r.key && r.value) hard[r.key] = r.value
          }
          if (
            editingReservation &&
            originalQuotaName &&
            originalQuotaName !== quotaName &&
            editingReservation.cluster &&
            editingReservation.namespace
          ) {
            try {
              await deleteResourceQuota(
                editingReservation.cluster,
                editingReservation.namespace,
                originalQuotaName,
              )
            } catch {
              // Non-fatal
            }
          }
          await createOrUpdateResourceQuota({ cluster, namespace, name: quotaName, hard, ensure_namespace: isNewNamespace })
          const id = reservationId || editingReservation?.id
          if (id) {
            try {
              await onActivate(id)
            } catch {
              // Non-fatal
            }
          }
        } catch {
          onError(t('gpuReservations.form.errors.quotaFailed'))
        }
      }

      onSaved()
      onClose()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('gpuReservations.form.errors.saveFailed')
      setError(msg)
      onError(msg)
    } finally {
      setIsSaving(false)
    }
  }

  return {
    t,
    cluster,
    setCluster,
    handleClusterChange,
    nsField,
    setNsField,
    namespace,
    isNewNamespace,
    title,
    setTitle,
    description,
    setDescription,
    gpuCount,
    setGpuCount,
    gpuPreferences,
    setGpuPreferences,
    startDate,
    setStartDate,
    durationHours,
    setDurationHours,
    notes,
    setNotes,
    enforceQuota,
    extraResources,
    setExtraResources,
    isSaving,
    error,
    showDiscardConfirm,
    setShowDiscardConfirm,
    forceClose,
    handleClose,
    handleSave,
    clusterNamespaces,
    namespacesLoading,
    namespacesError,
    refetchNamespaces,
    selectedClusterInfo,
    maxGPUs,
    gpuResourceKey,
    clusterGPUTypes,
    quotaName,
    additionalResourceTypes,
  }
}
