import { useLocation, useNavigate } from 'react-router-dom'
import { useStellar } from '../../hooks/useStellar'
import {
  STELLAR_NAVIGATION_EVENT,
  STELLAR_RAIL_ITEMS,
  isOnStellarRoute,
  isStellarRailItemActive,
  type StellarRailItem,
} from './navigation'

import '../../styles/stellar.css'

const STELLAR_RAIL_WIDTH_PX = 40
const STELLAR_RAIL_PADDING_TOP_PX = 12
const STELLAR_RAIL_GAP_PX = 10
const STELLAR_NAV_BUTTON_SIZE_PX = 24
const STELLAR_NAV_FONT_SIZE_PX = 11
const STELLAR_UNREAD_BADGE_SIZE_PX = 16
const STELLAR_CONNECTED_DOT_SIZE_PX = 7
const STELLAR_STATUS_MARGIN_BOTTOM_PX = 2
const STELLAR_BADGE_OFFSET_PX = -4
const STELLAR_BADGE_PADDING_X_PX = 3
const STELLAR_BADGE_FONT_SIZE_PX = 9
const STELLAR_UNREAD_COUNT_CAP = 99

function getTargetHash(target: StellarRailItem): string {
  return new URL(target.href, window.location.origin).hash
}

// StellarSidebar is a compact rail of Stellar shortcuts. Each item should take
// the operator to the right Stellar route or section instead of behaving like a
// single launcher button.
export function StellarSidebar() {
  const navigate = useNavigate()
  const location = useLocation()
  const { isConnected, unreadCount } = useStellar()
  const onStellarRoute = isOnStellarRoute(location.pathname)

  const handleNavigation = (target: StellarRailItem) => {
    const targetHash = getTargetHash(target)
    const sameTarget = location.pathname === target.route && location.hash === targetHash

    if (sameTarget && target.sectionId) {
      window.dispatchEvent(new CustomEvent(STELLAR_NAVIGATION_EVENT, {
        detail: { sectionId: target.sectionId },
      }))
      return
    }

    navigate(target.href)
  }

  return (
    <nav
      aria-label="Stellar shortcuts"
      style={{
        width: STELLAR_RAIL_WIDTH_PX,
        flexShrink: 0,
        height: '100%',
        background: 'var(--s-surface)',
        borderLeft: '1px solid var(--s-border)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        paddingTop: STELLAR_RAIL_PADDING_TOP_PX,
        gap: STELLAR_RAIL_GAP_PX,
      }}
    >
      <div
        style={{
          width: STELLAR_CONNECTED_DOT_SIZE_PX,
          height: STELLAR_CONNECTED_DOT_SIZE_PX,
          borderRadius: '50%',
          background: isConnected ? 'var(--s-success)' : 'var(--s-text-dim)',
          boxShadow: isConnected ? '0 0 5px var(--s-success)' : 'none',
          marginBottom: STELLAR_STATUS_MARGIN_BOTTOM_PX,
        }}
        title={isConnected ? 'Stellar connected' : 'Stellar disconnected'}
      />
      {STELLAR_RAIL_ITEMS.map(item => {
        const active = isStellarRailItemActive(item, location.pathname, location.hash)
        const showUnreadBadge = item.key === 'events' && unreadCount > 0
        return (
          <button
            key={item.key}
            type="button"
            aria-label={item.label}
            data-testid={`stellar-rail-${item.key}`}
            onClick={() => handleNavigation(item)}
            title={item.label}
            style={{
              position: 'relative',
              width: STELLAR_NAV_BUTTON_SIZE_PX,
              height: STELLAR_NAV_BUTTON_SIZE_PX,
              borderRadius: 'var(--s-rs)',
              border: 'none',
              cursor: 'pointer',
              background: active ? 'var(--s-brand)' : 'transparent',
              color: active ? '#0a0e14' : onStellarRoute ? 'var(--s-text)' : 'var(--s-brand)',
              fontFamily: 'var(--s-mono)',
              fontWeight: 700,
              fontSize: STELLAR_NAV_FONT_SIZE_PX,
              lineHeight: 1,
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <span aria-hidden>{item.glyph}</span>
            {showUnreadBadge && (
              <span
                aria-hidden
                style={{
                  position: 'absolute',
                  top: STELLAR_BADGE_OFFSET_PX,
                  right: STELLAR_BADGE_OFFSET_PX,
                  minWidth: STELLAR_UNREAD_BADGE_SIZE_PX,
                  height: STELLAR_UNREAD_BADGE_SIZE_PX,
                  borderRadius: STELLAR_UNREAD_BADGE_SIZE_PX,
                  padding: `0 ${STELLAR_BADGE_PADDING_X_PX}px`,
                  background: 'var(--s-critical)',
                  color: '#fff',
                  fontSize: STELLAR_BADGE_FONT_SIZE_PX,
                  fontWeight: 700,
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                {unreadCount > STELLAR_UNREAD_COUNT_CAP ? `${STELLAR_UNREAD_COUNT_CAP}+` : unreadCount}
              </span>
            )}
          </button>
        )
      })}
    </nav>
  )
}
