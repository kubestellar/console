import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { DashboardPage } from '../../lib/dashboards/DashboardPage'
import { getDefaultCards } from '../../config/dashboards'
import { getRememberPosition, setRememberPosition } from '../../hooks/useLastRoute'
import { RotatingTip } from '../ui/RotatingTip'

const ARCADE_CARDS_KEY = 'kubestellar-arcade-cards'
const DEFAULT_ARCADE_CARDS = getDefaultCards('arcade')

export function Arcade() {
  const { t } = useTranslation('common')
  const location = useLocation()

  // Pin: default ON for arcade — remember scroll position when navigating away
  const [pinned, setPinned] = useState<boolean>(() => {
    const stored = getRememberPosition(location.pathname)
    if (!stored) {
      setRememberPosition(location.pathname, true)
      return true
    }
    return stored
  })

  useEffect(() => {
    setPinned(getRememberPosition(location.pathname))
  }, [location.pathname])

  return (
    <DashboardPage
      title={t('arcade.title')}
      subtitle={t('arcade.subtitle')}
      icon="Gamepad2"
      storageKey={ARCADE_CARDS_KEY}
      defaultCards={DEFAULT_ARCADE_CARDS}
      statsType="clusters"
      isLoading={false}
      isRefreshing={false}
      rightExtra={<RotatingTip page="arcade" />}
      headerExtra={
        <label
          htmlFor="arcade-pin"
          className="flex items-center gap-1.5 cursor-pointer text-xs text-muted-foreground"
          title="Remember scroll position when navigating away"
        >
          <input
            type="checkbox"
            id="arcade-pin"
            checked={pinned}
            onChange={(e) => {
              setPinned(e.target.checked)
              setRememberPosition(location.pathname, e.target.checked)
            }}
            className="rounded border-border w-3.5 h-3.5"
          />
          Pin
        </label>
      }
    />
  )
}
