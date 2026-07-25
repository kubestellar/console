export function toDateInputValue(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hours = String(d.getHours()).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

export function toRFC3339StartDate(dateStr: string): string {
  const d = new Date(dateStr)
  d.setSeconds(0)
  d.setMilliseconds(0)
  return d.toISOString()
}

export function deriveQuotaName(gpuType: string, namespace: string): string {
  if (!gpuType || !namespace) return ''
  const sanitized = namespace.replace(/[^a-z0-9-]/gi, '-').toLowerCase()
  return `${sanitized}-${gpuType}-quota`.substring(0, 63)
}
