import { TFunction } from 'react-i18next'
import {
  createOrUpdateResourceQuota,
  deleteResourceQuota,
} from '../../../hooks/useMCP'
import type {
  GPUReservation,
  CreateGPUReservationInput,
  UpdateGPUReservationInput,
} from '../../../hooks/useGPUReservations'

/** Default reservation duration in hours when the field is left blank. */
const DEFAULT_RESERVATION_DURATION_HOURS = 24

/**
 * Convert a `<input type="date">` value (`YYYY-MM-DD`) to an RFC 3339
 * timestamp representing local midnight with an explicit timezone offset.
 */
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

interface HandleSaveParams {
  editingReservation: GPUReservation | null
  cluster: string
  namespace: string
  title: string
  description: string
  gpuCount: string
  gpuPreferences: string[]
  startDate: string
  durationHours: string
  notes: string
  enforceQuota: boolean
  quotaName: string
  originalQuotaName: string
  gpuResourceKey: string
  extraResources: Array<{ key: string; value: string }>
  isNewNamespace: boolean
  maxGPUs: number
  selectedClusterInfo: { totalGPUs: number } | undefined
  clusterGPUTypes: Array<{ type: string; total: number; available: number }>
  onSave: (input: CreateGPUReservationInput | UpdateGPUReservationInput) => Promise<string | void>
  onActivate: (id: string) => Promise<void>
  onSaved: () => void
  onError: (msg: string) => void
  t: TFunction
}

export async function handleReservationSave(params: HandleSaveParams): Promise<{ success: boolean; error?: string }> {
  const {
    editingReservation,
    cluster,
    namespace,
    title,
    description,
    gpuCount,
    gpuPreferences,
    startDate,
    durationHours,
    notes,
    enforceQuota,
    quotaName,
    originalQuotaName,
    gpuResourceKey,
    extraResources,
    isNewNamespace,
    maxGPUs,
    selectedClusterInfo,
    clusterGPUTypes,
    onSave,
    onActivate,
    onSaved,
    onError,
    t,
  } = params

  const count = parseInt(gpuCount)
  const originalCount = editingReservation?.gpu_count ?? 0
  const sameClusterAsOriginal = editingReservation ? cluster === editingReservation.cluster : true
  const capacityCeiling = editingReservation && sameClusterAsOriginal ? maxGPUs + originalCount : maxGPUs

  // Validation
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

  if (validationError) {
    return { success: false, error: validationError }
  }

  try {
    let reservationId: string | void
    const rfc3339StartDate = toRFC3339StartDate(startDate)

    // Canonical list of accepted GPU types
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

    // Create K8s ResourceQuota
    if (enforceQuota) {
      try {
        const hard: Record<string, string> = {
          [gpuResourceKey]: String(count),
        }
        for (const r of extraResources) {
          if (r.key && r.value) hard[r.key] = r.value
        }

        // Delete old quota if reservation was renamed
        if (
          editingReservation &&
          originalQuotaName &&
          originalQuotaName !== quotaName &&
          editingReservation.cluster &&
          editingReservation.namespace
        ) {
          try {
            await deleteResourceQuota(editingReservation.cluster, editingReservation.namespace, originalQuotaName)
          } catch {
            // Non-fatal
          }
        }

        await createOrUpdateResourceQuota({
          cluster,
          namespace,
          name: quotaName,
          hard,
          ensure_namespace: isNewNamespace,
        })

        // Activate the reservation
        const id = reservationId || editingReservation?.id
        if (id) {
          try {
            await onActivate(id)
          } catch {
            // non-fatal
          }
        }
      } catch {
        onError(t('gpuReservations.form.errors.quotaFailed'))
      }
    }

    onSaved()
    return { success: true }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : t('gpuReservations.form.errors.saveFailed')
    onError(msg)
    return { success: false, error: msg }
  }
}
