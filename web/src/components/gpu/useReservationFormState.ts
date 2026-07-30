import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  useNamespaces,
  createOrUpdateResourceQuota,
  deleteResourceQuota,
} from '../../hooks/useMCP'
import type { GPUNode } from '../../hooks/useMCP'
import type { GPUReservation, CreateGPUReservationInput, UpdateGPUReservationInput } from '../../hooks/useGPUReservations'
import { normalizeGpuTypes } from '../../hooks/useGPUReservations'
import type { GPUClusterInfo } from './ReservationFormModal'

type TranslateFn = (key: string, options?: string | Record<string, unknown>) => string

// GPU resource keys used to identify GPU quotas
const GPU_KEYS = ['nvidia.com/gpu', 'amd.com/gpu', 'gpu.intel.com/i915']

/** Maximum length of the sanitized title segment in a generated quota name. */
const QUOTA_NAME_TITLE_MAX_LEN = 40

/** Default reservation duration in hours when the field is left blank. */
const DEFAULT_RESERVATION_DURATION_HOURS = 24

const FILTERED_NS_PREFIXES = ['openshift-', 'kube-']
const FILTERED_NS_EXACT = ['default', 'kube-system', 'kube-public', 'kube-node-lease']

/**
 * Normalize any accepted start-date representation to the `YYYY-MM-DD`
 * format required by `<input type="date">`. Accepts either a bare date
 * (`2024-01-15`) or a full RFC 3339 timestamp (`2024-01-15T09:00:00Z`)
 * and returns just the date portion. Empty input returns an empty string.
 */
function toDateInputValue(value: string | undefined | null): string {
  if (!value) return ''
  // Both `YYYY-MM-DD` and `YYYY-MM-DDT...` share the same date prefix.
  return value.split('T')[0]
}

/**
 * Convert a `<input type="date">` value (`YYYY-MM-DD`) to an RFC 3339
 * timestamp representing local midnight with an explicit timezone offset
 * (`YYYY-MM-DDT00:00:00±HH:MM`). If the input is already an RFC 3339
 * timestamp, it is returned as-is.
 *
 * The local-offset form (rather than `Z`) prevents an off-by-one-day
 * display in calendar views: downstream code parses `start_date` with
 * `new Date(...)` and normalizes via `setHours(0, 0, 0, 0)`, which
 * shifts a hard-coded UTC midnight back a day for any user west of UTC
 * (e.g. Jan 15 00:00 UTC → Jan 14 in PST). Encoding the user's local
 * offset keeps the calendar day stable across the wire.
 */
function toRFC3339StartDate(value: string): string {
  if (!value) return ''
  if (value.includes('T')) return value

  // Date.getTimezoneOffset returns minutes WEST of UTC (positive for the
  // Americas, negative for Europe/Asia), so flip the sign to get the
  // signed offset that goes into the RFC 3339 string.
  const offsetMinutesWestOfUTC = new Date().getTimezoneOffset()
  const totalOffsetMinutes = -offsetMinutesWestOfUTC
  const offsetSign = totalOffsetMinutes >= 0 ? '+' : '-'
  const absoluteOffsetMinutes = Math.abs(totalOffsetMinutes)
  const minutesPerHour = 60
  const offsetHours = String(Math.floor(absoluteOffsetMinutes / minutesPerHour)).padStart(2, '0')
  const offsetMinutes = String(absoluteOffsetMinutes % minutesPerHour).padStart(2, '0')

  return `${value}T00:00:00${offsetSign}${offsetHours}:${offsetMinutes}`
}

/**
 * Derive the Kubernetes ResourceQuota name from a reservation title.
 * Exported as a local helper so both the current-title quota name and
 * the ORIGINAL-title quota name (used for cleanup on rename) are
 * computed identically.
 */
function deriveQuotaName(title: string): string {
  if (!title) return ''
  return `gpu-${title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, QUOTA_NAME_TITLE_MAX_LEN)}`
}

export interface UseReservationFormStateOptions {
  editingReservation: GPUReservation | null
  gpuClusters: GPUClusterInfo[]
  allNodes: GPUNode[]
  prefillDate?: string | null
  forceLive?: boolean
  knownNamespacesByCluster?: Record<string, string[]>
  onSave: (input: CreateGPUReservationInput | UpdateGPUReservationInput) => Promise<string | void>
  onActivate: (id: string) => Promise<void>
  onSaved: () => void
  onError: (msg: string) => void
  onClose: () => void
}

/**
 * Encapsulates all form field state, derived cluster/namespace/GPU-type
 * data, dirty-checking, and the save/quota-provisioning workflow for
 * ReservationFormModal. Extracted from ReservationFormModal.tsx (#21613)
 * to reduce the component's hook count and line count.
 */
export function useReservationFormState({
  editingReservation,
  gpuClusters,
  allNodes,
  prefillDate,
  forceLive,
  knownNamespacesByCluster,
  onSave,
  onActivate,
  onSaved,
  onError,
  onClose,
}: UseReservationFormStateOptions) {
  const { t: tTyped } = useTranslation(['cards', 'common'])
  const t = tTyped as unknown as TranslateFn
  const [cluster, setCluster] = useState(editingReservation?.cluster || '')
  // namespace value and "create new" toggle always change together → merged into
  // a single state object so each user interaction causes only one re-render.
  const [nsField, setNsField] = useState<{ value: string; isNew: boolean }>({
    value: editingReservation?.namespace || '',
    isNew: false,
  })
  const namespace = nsField.value
  const isNewNamespace = nsField.isNew
  const [title, setTitle] = useState(editingReservation?.title || '')
  const [description, setDescription] = useState(editingReservation?.description || '')
  const [gpuCount, setGpuCount] = useState(editingReservation ? String(editingReservation.gpu_count) : '')
  // Multi-type preference. `gpuPreferences` holds the list of
  // acceptable GPU types for this reservation — an empty array is
  // "no preference" (any type is acceptable), a one-element array is
  // the legacy single-type behaviour, and two or more entries implement
  // the multi-type-preference feature requested by
  // @MikeSpreitzer. Seeded from both the legacy `gpu_type` string and
  // the new `gpu_types` array via `normalizeGpuTypes` so edits of
  // existing pre-migration reservations keep their type.
  const [gpuPreferences, setGpuPreferences] = useState<string[]>(() => normalizeGpuTypes(editingReservation))
  const [startDate, setStartDate] = useState(
    toDateInputValue(editingReservation?.start_date) || prefillDate || new Date().toISOString().split('T')[0],
  )
  const [durationHours, setDurationHours] = useState(editingReservation ? String(editingReservation.duration_hours) : '')
  const [notes, setNotes] = useState(editingReservation?.notes || '')
  const enforceQuota = true
  const [extraResources, setExtraResources] = useState<Array<{ key: string; value: string }>>([])
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false)

  // Snapshot of the initial form state used for dirty detection. Captured
  // once when the modal is first rendered for this editing target so the
  // unsaved-changes dialog compares against the ORIGINAL values (not the
  // current values, which would always look "clean").
  const initialSnapshot = useMemo(
    () => ({
      cluster: editingReservation?.cluster || '',
      namespace: editingReservation?.namespace || '',
      title: editingReservation?.title || '',
      description: editingReservation?.description || '',
      gpuCount: editingReservation ? String(editingReservation.gpu_count) : '',
      // Snapshot the multi-type preference list so dirty
      // detection can see a type-only edit. Sorted so order churn
      // does not trip a false positive.
      gpuPreferences: [...normalizeGpuTypes(editingReservation)].sort(),
      startDate: toDateInputValue(editingReservation?.start_date) || prefillDate || new Date().toISOString().split('T')[0],
      durationHours: editingReservation ? String(editingReservation.duration_hours) : '',
      notes: editingReservation?.notes || '' }),
    // Re-snapshot only when the modal is opened for a different reservation
    // or with a different prefill date.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editingReservation?.id, prefillDate],
  )

  const forceClose = () => {
    setShowDiscardConfirm(false)
    onClose()
  }

  // Returns true if ANY user-editable field has diverged from the initial
  // snapshot. Previously this only inspected title/description, so edits
  // to cluster, namespace, GPU count/type, dates, duration, notes, or
  // extra resources could be discarded without confirmation.
  const isDirty = (): boolean => {
    if (cluster !== initialSnapshot.cluster) return true
    if (namespace !== initialSnapshot.namespace) return true
    if (title !== initialSnapshot.title) return true
    if (description !== initialSnapshot.description) return true
    if (gpuCount !== initialSnapshot.gpuCount) return true
    // Compare the sorted multi-type list. Order is intentionally
    // ignored because the form renders the same set regardless of
    // toggle order — only membership matters for dirty detection.
    const currentGpuPrefSorted = [...gpuPreferences].sort()
    if (currentGpuPrefSorted.length !== initialSnapshot.gpuPreferences.length) return true
    for (let i = 0; i < currentGpuPrefSorted.length; i++) {
      if (currentGpuPrefSorted[i] !== initialSnapshot.gpuPreferences[i]) return true
    }
    if (startDate !== initialSnapshot.startDate) return true
    if (durationHours !== initialSnapshot.durationHours) return true
    if (notes !== initialSnapshot.notes) return true
    // extraResources always starts empty for both create and edit flows —
    // any entry means the user added a row.
    if (extraResources.length > 0) return true
    return false
  }

  const handleClose = () => {
    if (isDirty()) {
      setShowDiscardConfirm(true)
      return
    }
    onClose()
  }

  const {
    namespaces: rawNamespaces,
    isLoading: namespacesLoading,
    error: namespacesError,
    refetch: refetchNamespaces,
  } = useNamespaces(cluster || undefined, forceLive)

  // Union the hook result with namespaces from existing reservations on
  // this cluster. Memoized to avoid re-allocating on every keystroke.
  const mergedRawNamespaces = useMemo(() => {
    const knownForCluster = (cluster && knownNamespacesByCluster?.[cluster]) || []
    if (knownForCluster.length === 0) return rawNamespaces
    return Array.from(new Set<string>([...rawNamespaces, ...knownForCluster])).sort()
  }, [rawNamespaces, cluster, knownNamespacesByCluster])

  // Filter out system namespaces from the dropdown
  const clusterNamespaces = mergedRawNamespaces.filter(ns =>
      !FILTERED_NS_PREFIXES.some(prefix => ns.startsWith(prefix)) &&
      !FILTERED_NS_EXACT.includes(ns)
    )

  // Get the selected cluster's GPU info
  const selectedClusterInfo = gpuClusters.find(c => c.name === cluster)
  const maxGPUs = selectedClusterInfo?.availableGPUs ?? 0

  // Auto-detect GPU resource key from cluster's GPU types
  const gpuResourceKey = (() => {
    if (!cluster) return 'limits.nvidia.com/gpu'
    const clusterNodes = allNodes.filter(n => n.cluster === cluster)
    const hasAMD = clusterNodes.some(n => n.gpuType.toLowerCase().includes('amd') || n.manufacturer?.toLowerCase().includes('amd'))
    const hasIntel = clusterNodes.some(n => n.gpuType.toLowerCase().includes('intel') || n.manufacturer?.toLowerCase().includes('intel'))
    if (hasAMD) return 'limits.amd.com/gpu'
    if (hasIntel) return 'gpu.intel.com/i915'
    return 'limits.nvidia.com/gpu'
  })()

  // GPU types available on selected cluster with per-type counts
  const clusterGPUTypes = (() => {
    if (!cluster) return [] as Array<{ type: string; total: number; available: number }>
    const typeMap: Record<string, { total: number; allocated: number }> = {}
    for (const n of allNodes.filter(n => n.cluster === cluster)) {
      if (!typeMap[n.gpuType]) typeMap[n.gpuType] = { total: 0, allocated: 0 }
      typeMap[n.gpuType].total += n.gpuCount
      typeMap[n.gpuType].allocated += n.gpuAllocated
    }
    return Object.entries(typeMap).map(([type, d]) => ({
      type,
      total: d.total,
      available: d.total - d.allocated }))
  })()

  // Auto-generate quota name from title
  const quotaName = deriveQuotaName(title)
  // Quota name computed from the ORIGINAL title, used to clean up a
  // stale ResourceQuota if the user renamed the reservation.
  const originalQuotaName = deriveQuotaName(editingReservation?.title || '')

  const handleSave = async () => {
    const count = parseInt(gpuCount)
    // For edits, capacity validation must account for the GPUs the current
    // reservation already holds: max allowed = availableGPUs + originalCount.
    // Without this, an edit could request more GPUs than the cluster has.
    const originalCount = editingReservation?.gpu_count ?? 0
    const sameClusterAsOriginal = editingReservation ? cluster === editingReservation.cluster : true
    const capacityCeiling = editingReservation && sameClusterAsOriginal
      ? maxGPUs + originalCount
      : maxGPUs
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
      // Backend requires RFC 3339; <input type="date"> only emits YYYY-MM-DD,
      // so normalize to midnight UTC before sending.
      const rfc3339StartDate = toRFC3339StartDate(startDate)
      // Canonical list of accepted GPU types. An empty list is
      // "no preference" (server-side: any GPU acceptable). If the user
      // left every type toggled off but the cluster only has one type,
      // fall back to that single type so the back-compat path with
      // older clusters stays unchanged.
      const gpuTypesList =
        gpuPreferences.length > 0
          ? gpuPreferences
          : clusterGPUTypes.length === 1 && clusterGPUTypes[0]?.type
          ? [clusterGPUTypes[0].type]
          : []
      // Legacy singular mirror — kept for pre-multitype clients still
      // reading `gpu_type`. See CLAUDE.md back-compat rule.
      const primaryGpuType = gpuTypesList[0] || ''
      const sharedInput = {
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
        max_cluster_gpus: selectedClusterInfo?.totalGPUs }
      reservationId = editingReservation
        ? await onSave(sharedInput as UpdateGPUReservationInput)
        : await onSave(sharedInput as CreateGPUReservationInput)

      // Create K8s ResourceQuota (auto-creates namespace if needed)
      if (enforceQuota) {
        try {
          const hard: Record<string, string> = {
            [gpuResourceKey]: String(count) }
          for (const r of extraResources) {
            if (r.key && r.value) hard[r.key] = r.value
          }
          // If the reservation was renamed, the quota name (which is
          // derived from the title) will be different. Delete the old
          // quota first so it does not linger orphaned in the namespace.
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
              // Non-fatal: old quota may already be gone (e.g. 404).
              // Proceed with creating the renamed quota regardless.
            }
          }
          await createOrUpdateResourceQuota({ cluster, namespace, name: quotaName, hard, ensure_namespace: isNewNamespace })
          // Quota enforced successfully — activate the reservation
          const id = reservationId || editingReservation?.id
          if (id) {
            try { await onActivate(id) } catch { /* non-fatal */ }
          }
        } catch {
          // Non-fatal: reservation is saved, but quota enforcement failed — stays pending
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
    cluster, setCluster,
    namespace, isNewNamespace, setNsField,
    title, setTitle,
    description, setDescription,
    gpuCount, setGpuCount,
    gpuPreferences, setGpuPreferences,
    startDate, setStartDate,
    durationHours, setDurationHours,
    notes, setNotes,
    enforceQuota,
    extraResources, setExtraResources,
    isSaving,
    error,
    showDiscardConfirm, setShowDiscardConfirm,
    forceClose,
    handleClose,
    handleSave,
    namespacesLoading,
    namespacesError,
    refetchNamespaces,
    clusterNamespaces,
    selectedClusterInfo,
    maxGPUs,
    gpuResourceKey,
    clusterGPUTypes,
    quotaName,
    GPU_KEYS,
  }
}
