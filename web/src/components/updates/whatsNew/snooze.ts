const SNOOZE_STORAGE_KEY = 'kc-update-snoozed'

export function isUpdateSnoozed(): boolean {
  try {
    const raw = localStorage.getItem(SNOOZE_STORAGE_KEY)
    if (!raw) return false
    const snoozedUntil = Number(raw)
    return Date.now() < snoozedUntil
  } catch {
    return false
  }
}

export function snoozeUpdate(durationMs: number) {
  try {
    localStorage.setItem(SNOOZE_STORAGE_KEY, String(Date.now() + durationMs))
  } catch {
    // localStorage unavailable — silently ignore
  }
}
