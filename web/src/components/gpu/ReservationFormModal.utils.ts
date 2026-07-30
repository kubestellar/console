/** Maximum length of the sanitized title segment in a generated quota name. */
export const QUOTA_NAME_TITLE_MAX_LEN = 40

/** Default reservation duration in hours when the field is left blank. */
export const DEFAULT_RESERVATION_DURATION_HOURS = 24

/** GPU resource keys used to identify GPU quotas */
export const GPU_KEYS = ['nvidia.com/gpu', 'amd.com/gpu', 'gpu.intel.com/i915']

/** GPU cluster info for dropdown */
export interface GPUClusterInfo {
  name: string
  totalGPUs: number
  allocatedGPUs: number
  availableGPUs: number
  gpuTypes: string[]
}

/**
 * Normalize any accepted start-date representation to the `YYYY-MM-DD`
 * format required by `<input type="date">`.
 */
export function toDateInputValue(value: string | undefined | null): string {
  if (!value) return ''
  return value.split('T')[0]
}

/**
 * Convert a `<input type="date">` value (`YYYY-MM-DD`) to an RFC 3339
 * timestamp representing local midnight with an explicit timezone offset.
 */
export function toRFC3339StartDate(value: string): string {
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

/**
 * Derive the Kubernetes ResourceQuota name from a reservation title.
 */
export function deriveQuotaName(title: string): string {
  if (!title) return ''
  return `gpu-${title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, QUOTA_NAME_TITLE_MAX_LEN)}`
}
