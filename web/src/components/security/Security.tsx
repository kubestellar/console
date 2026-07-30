import { useEffect } from 'react'
import { useSearchParams, useLocation } from 'react-router-dom'
import { getDefaultCards } from '../../config/dashboards'
import { ensureCardInDashboard } from '../../lib/dashboards/migrateStorageKey'
import { VulnerabilitySummary } from './VulnerabilitySummary'

const SECURITY_CARDS_KEY = 'kubestellar-security-cards'

ensureCardInDashboard(SECURITY_CARDS_KEY, 'iso27001_audit', {
  id: 'security-0',
  card_type: 'iso27001_audit',
  position: { w: 6, h: 3, x: 0, y: 0 },
})

const DEFAULT_SECURITY_CARDS = getDefaultCards('security')

export function Security() {
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()

  useEffect(() => {
    if (location.pathname !== '/security') return
    if (searchParams.get('addCard') === 'true') {
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams, location.pathname])

  return (
    <VulnerabilitySummary
      securityCardsKey={SECURITY_CARDS_KEY}
      defaultSecurityCards={DEFAULT_SECURITY_CARDS}
    />
  )
}
