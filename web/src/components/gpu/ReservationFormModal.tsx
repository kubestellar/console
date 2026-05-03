import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Zap,
  Calendar,
  Plus,
  Trash2,
  Loader2 } from 'lucide-react'
import { BaseModal, ConfirmDialog } from '../../lib/modals'
import {
  useNamespaces,
  createOrUpdateResourceQuota,
  deleteResourceQuota,
  COMMON_RESOURCE_TYPES } from '../../hooks/useMCP'
import type { GPUNode } from '../../hooks/useMCP'
import type { GPUReservation, CreateGPUReservationInput, UpdateGPUReservationInput } from '../../hooks/useGPUReservations'
import { normalizeGpuTypes } from '../../hooks/useGPUReservations'
import { cn } from '../../lib/cn'

// GPU resource keys used to identify GPU quotas
const GPU_KEYS = ['nvidia.com/gpu', 'amd.com/gpu', 'gpu.intel.com/i915']

/** Maximum length of the sanitized title segment in a generated quota name. */
const QUOTA_NAME_TITLE_MAX_LEN = 40

/** Default reservation duration in hours when the field is left blank. */
const DEFAULT_RESERVATION_DURATION_HOURS = 24

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

// GPU cluster info for dropdown
export interface GPUClusterInfo {
  name: string
  totalGPUs: number
  allocatedGPUs: number
  availableGPUs: number
  gpuTypes: string[]
}

export function ReservationFormModal({
  isOpen,
  onClose,
  editingReservation,
  gpuClusters,
  allNodes,
  user,
  prefillDate,
  forceLive,
  knownNamespacesByCluster,
  onSave,
  onActivate,
  onSaved,
  onError }: {
  isOpen: boolean
  onClose: () => void
  editingReservation: GPUReservation | null
  gpuClusters: GPUClusterInfo[]
  allNodes: GPUNode[]
  user: { github_login: string; email?: string } | null
  prefillDate?: string | null
  /** When true, skip demo mode fallback for namespace list */
  forceLive?: boolean
  /**
   * Map of cluster name → namespaces known to have existing reservations.
   * Union'd with the `useNamespaces()` result as a fallback when the fetch
   * tiers don't return them (e.g. user lacks cluster-wide list RBAC and the
   * namespace has no running pods). System namespaces (default, kube-system,
   * kube-*, openshift-*, etc.) are still filtered out of the dropdown
   * regardless of what this prop contains.
   */
  knownNamespacesByCluster?: Record<string, string[]>
  onSave: (input: CreateGPUReservationInput | UpdateGPUReservationInput) => Promise<string | void>
  onActivate: (id: string) => Promise<void>
  onSaved: () => void
  onError: (msg: string) => void
}) {
  const { t } = useTranslation(['cards', 'common'])
  const [cluster, setCluster] = useState(editingReservation?.cluster || '')
  const [namespace, setNamespace] = useState(editingReservation?.namespace || '')
  const [isNewNamespace, setIsNewNamespace] = useState(false)
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

  const { namespaces: rawNamespaces } = useNamespaces(cluster || undefined, forceLive)

  // Union the hook result with namespaces from existing reservations on
  // this cluster. Memoized to avoid re-allocating on every keystroke.
  const mergedRawNamespaces = useMemo(() => {
    const knownForCluster = (cluster && knownNamespacesByCluster?.[cluster]) || []
    if (knownForCluster.length === 0) return rawNamespaces
    return Array.from(new Set<string>([...rawNamespaces, ...knownForCluster])).sort()
  }, [rawNamespaces, cluster, knownNamespacesByCluster])

  // Filter out system namespaces from the dropdown
  const FILTERED_NS_PREFIXES = ['openshift-', 'kube-']
  const FILTERED_NS_EXACT = ['default', 'kube-system', 'kube-public', 'kube-node-lease']
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
      if (editingReservation) {
        // Partial update
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
          max_cluster_gpus: selectedClusterInfo?.totalGPUs }
        reservationId = await onSave(input)
      } else {
        // Create
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
          max_cluster_gpus: selectedClusterInfo?.totalGPUs }
        reservationId = await onSave(input)
      }

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

  return (
    <BaseModal isOpen={isOpen} onClose={handleClose} size="lg" closeOnBackdrop={false} closeOnEscape={true}>
      <ConfirmDialog
        isOpen={showDiscardConfirm}
        onClose={() => setShowDiscardConfirm(false)}
        onConfirm={forceClose}
        title={t('common:common.discardUnsavedChanges', 'Discard unsaved changes?')}
        message={t('common:common.discardUnsavedChangesMessage', 'You have unsaved changes that will be lost.')}
        confirmLabel={t('common:common.discard', 'Discard')}
        cancelLabel={t('common:common.keepEditing', 'Keep editing')}
        variant="warning"
      />
      <BaseModal.Header
        title={editingReservation ? t('gpuReservations.form.editTitle') : t('gpuReservations.form.createTitle')}
        icon={Calendar}
        onClose={handleClose}
        showBack={false}
      />

      <BaseModal.Content className="max-h-[70vh]">
        <div className="space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>
          )}

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">{t('gpuReservations.form.fields.titleLabel')}</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)}
              placeholder={t('gpuReservations.form.fields.titlePlaceholder')}
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground" />
          </div>

          {/* User info (read-only from auth) */}
          {user && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">{t('gpuReservations.form.fields.userName')}</label>
                <input type="text" value={user.email || user.github_login} readOnly
                  className="w-full px-3 py-2 rounded-lg bg-secondary/50 border border-border text-muted-foreground" />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">{t('gpuReservations.form.fields.githubHandle')}</label>
                <input type="text" value={user.github_login} readOnly
                  className="w-full px-3 py-2 rounded-lg bg-secondary/50 border border-border text-muted-foreground" />
              </div>
            </div>
          )}

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">{t('common:common.description')}</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
              placeholder={t('gpuReservations.form.fields.descriptionPlaceholder')}
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground" />
          </div>

          {/* Cluster (GPU-only, with counts) */}
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">{t('gpuReservations.form.fields.clusterLabel')}</label>
            <select value={cluster} onChange={e => { setCluster(e.target.value); setNamespace(''); setIsNewNamespace(false); setGpuPreferences([]) }}
              disabled={!!editingReservation}
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground disabled:opacity-50">
              <option value="">{t('gpuReservations.form.fields.selectCluster')}</option>
              {gpuClusters.map(c => (
                <option key={c.name} value={c.name}>
                  {t('gpuReservations.form.fields.clusterOption', { name: c.name, available: c.availableGPUs, total: c.totalGPUs })}
                </option>
              ))}
            </select>
            {gpuClusters.length === 0 && (
              <div className="text-xs text-yellow-400 mt-1">{t('gpuReservations.form.fields.noClustersWithGpus')}</div>
            )}
          </div>

          {/* Namespace */}
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">{t('gpuReservations.form.fields.namespaceLabel')}</label>
            {!isNewNamespace ? (
              <select
                value={namespace}
                onChange={e => {
                  if (e.target.value === '__new__' || e.target.value === '__new_bottom__') {
                    setIsNewNamespace(true)
                    setNamespace('')
                    setTimeout(() => document.getElementById('new-ns-input')?.focus(), 0)
                  } else {
                    setNamespace(e.target.value)
                  }
                }}
                disabled={!!editingReservation || !cluster}
                className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground disabled:opacity-50"
              >
                <option value="">{t('gpuReservations.form.fields.selectNamespace')}</option>
                <option value="__new__">{t('gpuReservations.form.fields.newNamespace')}</option>
                {clusterNamespaces.map(ns => (
                  <option key={ns} value={ns}>{ns}</option>
                ))}
                <option value="__new_bottom__">{t('gpuReservations.form.fields.newNamespace')}</option>
              </select>
            ) : (
              <div className="flex gap-2">
                <input
                  id="new-ns-input"
                  type="text"
                  value={namespace}
                  onChange={e => setNamespace(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  placeholder={t('gpuReservations.form.fields.enterNamespace')}
                  disabled={!!editingReservation}
                  className="flex-1 px-3 py-2 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground disabled:opacity-50"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => { setIsNewNamespace(false); setNamespace('') }}
                  className="px-3 py-2 rounded-lg bg-secondary border border-border text-muted-foreground hover:text-foreground"
                  title={t('gpuReservations.form.fields.backToList')}
                  aria-label={t('gpuReservations.form.fields.backToList')}
                >
                  &times;
                </button>
              </div>
            )}
          </div>

          {/* GPU Count */}
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">
              {t('gpuReservations.form.fields.gpuCountLabel')}
              {selectedClusterInfo && (
                <span className="text-xs text-green-400 ml-2">
                  {t('gpuReservations.form.fields.maxAvailable', { count: selectedClusterInfo.availableGPUs })}
                </span>
              )}
            </label>
            <input type="number" value={gpuCount} onChange={e => setGpuCount(e.target.value)}
              min="1" max={maxGPUs || undefined}
              placeholder={t('gpuReservations.form.fields.gpuCountPlaceholder')}
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground" />
          </div>

          {/* GPU Type Selection — multi-select. Toggling a type
              adds or removes it from the accepted-types list. Selecting
              none means "no preference" (server accepts any type);
              selecting two or more lets a developer reserve "any
              sufficiently powerful GPU". */}
          {clusterGPUTypes.length > 1 && (
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-2">{t('gpuReservations.form.fields.gpuTypeLabel')}</label>
              <div className="flex flex-wrap gap-2">
                {clusterGPUTypes.map(gt => {
                  const isSelected = gpuPreferences.includes(gt.type)
                  return (
                    <button
                      key={gt.type}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => {
                        setGpuPreferences(prev =>
                          prev.includes(gt.type)
                            ? prev.filter(t => t !== gt.type)
                            : [...prev, gt.type],
                        )
                      }}
                      className={cn(
                        'flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm transition-colors',
                        isSelected
                          ? 'border-purple-500 bg-purple-500/10 text-purple-400'
                          : 'border-border bg-secondary text-muted-foreground hover:text-foreground',
                      )}
                    >
                      <Zap className="w-3.5 h-3.5" />
                      {gt.type}
                      <span className="text-xs opacity-70">{t('gpuReservations.form.fields.gpuTypeAvailability', { available: gt.available, total: gt.total })}</span>
                    </button>
                  )
                })}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {/* Helper copy for the multi-type selector.
                    Kept as plain English for now — a follow-up PR
                    will add i18n keys to all locale bundles once the
                    base feature lands and the UX is approved. */}
                {gpuPreferences.length === 0
                  ? 'No type selected — any GPU will be accepted.'
                  : gpuPreferences.length === 1
                  ? '1 type accepted'
                  : `${gpuPreferences.length} types accepted`}
              </div>
            </div>
          )}
          {/* Single GPU type — show as info */}
          {clusterGPUTypes.length === 1 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Zap className="w-3.5 h-3.5 text-purple-400" />
              {clusterGPUTypes[0].type}
              <span className="text-xs">{t('gpuReservations.form.fields.singleGpuType', { available: clusterGPUTypes[0].available, total: clusterGPUTypes[0].total })}</span>
            </div>
          )}

          {/* Start Date and Duration */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">{t('gpuReservations.form.fields.startDateLabel')}</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground" />
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">{t('gpuReservations.form.fields.durationLabel')}</label>
              <input type="number" value={durationHours} onChange={e => setDurationHours(e.target.value)}
                min="1" placeholder={t('gpuReservations.form.fields.durationPlaceholder')}
                className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground" />
            </div>
          </div>

          {/* Additional Resource Limits */}
          {enforceQuota && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-muted-foreground">{t('gpuReservations.form.fields.additionalLimits')}</label>
                <button onClick={() => setExtraResources([...extraResources, { key: '', value: '' }])}
                  className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-blue-500/20 text-blue-400 hover:bg-blue-500/30">
                  <Plus className="w-3 h-3" /> {t('gpuReservations.form.fields.add')}
                </button>
              </div>
              {extraResources.map((r, i) => (
                <div key={i} className="flex items-center gap-2 mb-2">
                  <select value={r.key} onChange={e => {
                    const updated = [...extraResources]
                    updated[i].key = e.target.value
                    setExtraResources(updated)
                  }} className="flex-1 px-2 py-1.5 rounded bg-secondary border border-border text-sm text-foreground">
                    <option value="">{t('gpuReservations.form.fields.selectResource')}</option>
                    {COMMON_RESOURCE_TYPES.filter(rt => !GPU_KEYS.some(gk => rt.key.includes(gk))).map(rt => (
                      <option key={rt.key} value={rt.key}>{rt.label}</option>
                    ))}
                  </select>
                  <input type="text" value={r.value} onChange={e => {
                    const updated = [...extraResources]
                    updated[i].value = e.target.value
                    setExtraResources(updated)
                  }} placeholder={t('gpuReservations.form.fields.resourcePlaceholder')} className="w-24 px-2 py-1.5 rounded bg-secondary border border-border text-sm text-foreground" />
                  <button onClick={() => setExtraResources(extraResources.filter((_, j) => j !== i))}
                    className="p-1 hover:bg-secondary rounded text-muted-foreground hover:text-red-400"
                    aria-label="Remove resource limit">
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">{t('gpuReservations.form.fields.notesLabel')}</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder={t('gpuReservations.form.fields.notesPlaceholder')}
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground" />
          </div>

          {/* Preview */}
          <div className="p-3 rounded-lg bg-purple-500/5 border border-purple-500/20">
            <div className="text-xs font-medium text-purple-400 mb-1">{t('gpuReservations.form.fields.preview')}</div>
            <div className="text-xs text-muted-foreground space-y-0.5">
              <div>{t('gpuReservations.form.fields.previewFields.title')} <span className="text-foreground">{title || '...'}</span></div>
              <div>{t('gpuReservations.form.fields.previewFields.cluster')} <span className="text-foreground">{cluster || '...'}</span></div>
              <div>{t('gpuReservations.form.fields.previewFields.namespace')} <span className="text-foreground">{namespace || '...'}</span></div>
              <div>{t('gpuReservations.form.fields.previewFields.gpus')} <span className="text-foreground">{gpuCount || '...'}</span></div>
              <div>{t('gpuReservations.form.fields.previewFields.start')} <span className="text-foreground">{startDate || '...'}</span></div>
              <div>{t('gpuReservations.form.fields.previewFields.duration')} <span className="text-foreground">{durationHours || '24'}h</span></div>
              {enforceQuota && (
                <div>{t('gpuReservations.form.fields.previewFields.k8sQuota')} <span className="text-foreground">{quotaName || '...'} ({gpuResourceKey})</span></div>
              )}
            </div>
          </div>
        </div>
      </BaseModal.Content>

      <BaseModal.Footer>
        <div className="flex-1" />
        <div className="flex gap-3">
          {([
            { key: 'cancel', label: t('gpuReservations.form.buttons.cancel'), onClick: handleClose, disabled: false, className: 'px-4 py-2 rounded-lg bg-secondary text-muted-foreground hover:text-foreground transition-colors' },
            { key: 'save', label: editingReservation ? t('gpuReservations.form.buttons.update') : t('gpuReservations.form.buttons.create'), onClick: handleSave, disabled: isSaving, className: 'flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-500 text-white hover:bg-purple-600 disabled:opacity-50 transition-colors' },
          ] as const).map(({ key, label, onClick, disabled, className }) => (
            <button key={key} onClick={onClick} disabled={disabled} className={className}>
              {key === 'save' && isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
              {label}
            </button>
          ))}
        </div>
      </BaseModal.Footer>
    </BaseModal>
  )
}
