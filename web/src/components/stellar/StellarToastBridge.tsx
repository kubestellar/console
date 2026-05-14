import { useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useStellar } from '../../hooks/useStellar'
import { useToast } from '../ui/Toast'
import { ROUTES } from '../../config/routes'

// Severities that interrupt the user on other pages. Info-level events stay silent.
const TOAST_SEVERITIES = new Set(['critical', 'warning'])
// Types that warrant cross-page notification.
const TOAST_TYPES = new Set(['event', 'ActionRequired', 'observation', 'action'])
// Tolerance (ms) for clock skew between server-side createdAt and client mount time.
const MOUNT_TIME_TOLERANCE_MS = 10_000
// Cap on how many notifications to remember as "already toasted".
const SEEN_BUFFER_LIMIT = 500

/**
 * StellarToastBridge fires a toast (and optional browser notification) whenever
 * Stellar surfaces a new critical/warning event while the user is NOT on the
 * Stellar page. Mounted EAGERLY (not lazy) in Layout — late mounting caused a
 * race where SSE-delivered events arrived before the bridge was loaded, all of
 * them got seeded as "already seen", and no toast ever fired.
 *
 * Strategy:
 * - Track which notification IDs we've already toasted (prevents re-toast on
 *   re-renders or list reshuffles).
 * - Suppress notifications whose createdAt is older than mount-time minus a
 *   10s tolerance — those are history (from a refresh), not new arrivals.
 * - Suppress toasts when the user is already on /stellar (the card itself
 *   is enough signal).
 */
export function StellarToastBridge() {
  const { notifications } = useStellar()
  const { showToast } = useToast()
  const navigate = useNavigate()
  const location = useLocation()

  const toastedIdsRef = useRef<Set<string>>(new Set())
  const mountedAtRef = useRef<number>(Date.now())
  const permissionAskedRef = useRef<boolean>(false)

  useEffect(() => {
    if (notifications.length === 0) return
    const onStellarPage = location.pathname === ROUTES.STELLAR
    const cutoff = mountedAtRef.current - MOUNT_TIME_TOLERANCE_MS

    for (const n of notifications) {
      if (!n.id) continue
      if (toastedIdsRef.current.has(n.id)) continue

      // History suppression: skip notifications created before we mounted.
      const createdMs = n.createdAt ? new Date(n.createdAt).getTime() : Date.now()
      if (createdMs < cutoff) {
        toastedIdsRef.current.add(n.id) // mark seen so we don't recheck every render
        continue
      }

      // Mark seen BEFORE filtering, so we don't recheck this id again even if
      // it isn't a toast candidate.
      toastedIdsRef.current.add(n.id)

      // Special case: Stellar auto-fix results. These bypass the severity gate
      // so the user is always notified when Stellar acted without approval —
      // even successful ones, because "the AI fixed it without asking" is
      // exactly the moment we want to surface.
      const isAutoFixSuccess = n.title.startsWith('Stellar auto-fixed')
      const isAutoFixFailure = n.title.startsWith('Stellar auto-fix failed')

      if (!isAutoFixSuccess && !isAutoFixFailure) {
        if (!TOAST_SEVERITIES.has(n.severity)) continue
        if (!TOAST_TYPES.has(n.type)) continue
        // Routine events on /stellar are already visible in the event list —
        // skip the toast to avoid double-signal. Auto-fix toasts always fire
        // regardless of route since they're the "Stellar acted" wow moment.
        if (onStellarPage) continue
      }

      let toastType: 'success' | 'warning' | 'error'
      if (isAutoFixSuccess) toastType = 'success'
      else if (isAutoFixFailure) toastType = 'error'
      else if (n.severity === 'critical') toastType = 'error'
      else toastType = 'warning'
      showToast(`Stellar: ${n.title}`, toastType)

      maybeBrowserNotify(n.title, n.body, n.id, permissionAskedRef, () => {
        window.focus()
        navigate(ROUTES.STELLAR)
      })
    }

    if (toastedIdsRef.current.size > SEEN_BUFFER_LIMIT) {
      const ids = Array.from(toastedIdsRef.current)
      toastedIdsRef.current = new Set(ids.slice(-Math.floor(SEEN_BUFFER_LIMIT / 2)))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifications, location.pathname])

  return null
}

function maybeBrowserNotify(
  title: string,
  body: string,
  tag: string,
  permissionAskedRef: React.MutableRefObject<boolean>,
  onClick: () => void,
) {
  if (typeof window === 'undefined' || !('Notification' in window)) return
  if (!document.hidden) return

  const fire = () => {
    try {
      const n = new Notification(`Stellar — ${title}`, {
        body: (body || '').slice(0, 240),
        tag,
        icon: '/favicon.ico',
      })
      n.onclick = onClick
    } catch { /* ignore */ }
  }

  if (Notification.permission === 'granted') {
    fire()
    return
  }
  if (Notification.permission === 'denied') return
  if (permissionAskedRef.current) return
  permissionAskedRef.current = true
  void Notification.requestPermission().then(perm => {
    if (perm === 'granted') fire()
  })
}
