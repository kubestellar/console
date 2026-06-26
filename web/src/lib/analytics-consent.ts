import { STORAGE_KEY_ANALYTICS_OPT_OUT } from './constants'
import { CID_KEY, isOptedOut, LAST_KEY, SC_KEY, SID_KEY, stopEngagementTracking } from './analytics-session'
import { send } from './analytics-dispatch'

export function setAnalyticsOptOut(optOut: boolean) {
  if (optOut) {
    send('ksc_analytics_opted_out', {})
  } else {
    send('ksc_analytics_opted_in', {})
  }
  localStorage.setItem(STORAGE_KEY_ANALYTICS_OPT_OUT, String(optOut))
  window.dispatchEvent(new CustomEvent('kubestellar-settings-changed'))
  if (optOut) {
    stopEngagementTracking()
    document.cookie.split(';').forEach(cookie => {
      const name = cookie.split('=')[0].trim()
      if (name.startsWith('_ga') || name.startsWith('_ksc')) {
        document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`
      }
    })
    localStorage.removeItem(CID_KEY)
    localStorage.removeItem(SID_KEY)
    localStorage.removeItem(SC_KEY)
    localStorage.removeItem(LAST_KEY)
  }
}

export function isAnalyticsOptedOut(): boolean {
  return isOptedOut()
}
