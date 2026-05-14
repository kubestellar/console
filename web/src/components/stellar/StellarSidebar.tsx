import { useNavigate, useLocation } from 'react-router-dom'
import { useStellar } from '../../hooks/useStellar'
import { ROUTES } from '../../config/routes'

import '../../styles/stellar.css'

// StellarSidebar is now a thin 40px launcher rail that navigates the user to
// the full Stellar page (/stellar). The full UI used to live inline here; it
// now has its own route at StellarPage.tsx because there's too much information
// for a 380px sidebar to do it justice.
export function StellarSidebar() {
  const navigate = useNavigate()
  const location = useLocation()
  const { isConnected, unreadCount } = useStellar()
  const onStellarPage = location.pathname === ROUTES.STELLAR

  return (
    <div
      style={{
        width: 40,
        flexShrink: 0,
        height: '100%',
        background: 'var(--s-surface)',
        borderLeft: '1px solid var(--s-border)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        paddingTop: 12,
        gap: 10,
      }}
    >
      <button
        onClick={() => {
          if (onStellarPage) {
            navigate(-1)
          } else {
            navigate(ROUTES.STELLAR)
          }
        }}
        title={onStellarPage ? 'Back' : 'Open Stellar'}
        style={{
          background: onStellarPage ? 'var(--s-brand)' : 'none',
          border: 'none',
          cursor: 'pointer',
          color: onStellarPage ? '#0a0e14' : 'var(--s-brand)',
          fontSize: 18,
          padding: 4,
          lineHeight: 1,
          borderRadius: 'var(--s-rs)',
        }}
      >
        {onStellarPage ? '◂' : '✦'}
      </button>
      <div
        style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: isConnected ? 'var(--s-success)' : 'var(--s-text-dim)',
          boxShadow: isConnected ? '0 0 5px var(--s-success)' : 'none',
        }}
        title={isConnected ? 'Connected' : 'Disconnected'}
      />
      {unreadCount > 0 && (
        <button
          onClick={() => navigate(ROUTES.STELLAR)}
          title={`${unreadCount} unread events — open Stellar`}
          style={{
            background: 'var(--s-critical)',
            color: '#fff',
            border: 'none',
            cursor: 'pointer',
            borderRadius: 10,
            fontSize: 10,
            fontWeight: 700,
            padding: '2px 5px',
            minWidth: 18,
            textAlign: 'center',
          }}
        >
          {unreadCount > 99 ? '99+' : unreadCount}
        </button>
      )}
    </div>
  )
}
