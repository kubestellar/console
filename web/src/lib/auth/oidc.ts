/**
 * OIDC / session-expiry UI utilities.
 *
 * Extracted from auth.tsx — see issue #15790 / #21605.
 */
import i18n from '../i18n'

/**
 * Inject a DOM-based warning banner when the session is about to expire.
 * The user can click "Refresh Now" to silently renew their token.
 */
export function showExpiryWarningBanner(onRefresh: () => void): void {
  if (document.getElementById('session-expiry-warning')) return

  const BANNER_BOTTOM_PX = '24px'
  const BANNER_GAP_PX = '12px'
  const BANNER_PAD_V_PX = '12px'
  const BANNER_PAD_H_PX = '20px'
  const BANNER_RADIUS_PX = '8px'
  const WARN_BG = 'hsl(var(--warning) / 0.15)'
  const WARN_BORDER = 'hsl(var(--warning) / 0.4)'
  const WARN_TEXT = 'hsl(var(--warning-foreground))'
  const BTN_MARGIN_LEFT_PX = '8px'
  const BTN_PAD_V_PX = '4px'
  const BTN_PAD_H_PX = '12px'
  const TOAST_Z_INDEX = 99_999

  const banner = document.createElement('div')
  banner.id = 'session-expiry-warning'
  banner.style.cssText = `
    position: fixed; bottom: ${BANNER_BOTTOM_PX}; left: 50%; transform: translateX(-50%); z-index: ${TOAST_Z_INDEX};
    display: flex; align-items: center; gap: ${BANNER_GAP_PX};
    padding: ${BANNER_PAD_V_PX} ${BANNER_PAD_H_PX};
    background: ${WARN_BG};
    border: 1px solid ${WARN_BORDER};
    border-radius: ${BANNER_RADIUS_PX}; backdrop-filter: blur(8px);
    color: ${WARN_TEXT}; font-family: system-ui, sans-serif; font-size: 14px;
    animation: slideUp 0.3s ease-out;
  `
  banner.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
    </svg>
    <span><strong>${i18n.t('session.expiresSoon')}</strong></span>
  `

  const btn = document.createElement('button')
  btn.textContent = i18n.t('session.refreshNow')
  btn.style.cssText = `
    margin-left: ${BTN_MARGIN_LEFT_PX}; padding: ${BTN_PAD_V_PX} ${BTN_PAD_H_PX}; border-radius: ${BANNER_RADIUS_PX};
    background: hsl(var(--warning) / 0.3); border: 1px solid hsl(var(--warning) / 0.5);
    color: hsl(var(--warning-foreground)); cursor: pointer; font-size: 13px; font-family: inherit;
  `
  btn.onclick = () => { onRefresh(); banner.remove() }
  banner.appendChild(btn)

  const STYLE_ID = 'session-banner-animation'
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = `@keyframes slideUp { from { transform: translateX(-50%) translateY(100%); opacity: 0; } to { transform: translateX(-50%) translateY(0); opacity: 1; } }`
    document.head.appendChild(style)
  }
  document.body.appendChild(banner)
}
