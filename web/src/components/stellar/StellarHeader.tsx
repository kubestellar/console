import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useStellar } from '../../hooks/useStellar'
import { Button } from '../ui/Button'
import { Select } from '../ui/Select'
import { getNextBatchCountdown, STELLAR_BATCH_INTERVAL_OPTIONS } from './lib/time'

const BATCH_COUNTDOWN_REFRESH_MS = 1000
const STELLAR_HEADER_STATUS_DOT_SIZE_PX = 7
const STELLAR_HEADER_BADGE_RADIUS_PX = 10
const STELLAR_HEADER_UNREAD_BADGE_MIN_WIDTH_PX = 18

interface Props {
  isConnected: boolean
  unreadCount: number
  clusterCount: number
  onCollapse?: () => void
  showCollapse?: boolean
}

export function StellarHeader({
  isConnected,
  unreadCount,
  clusterCount,
  onCollapse,
  showCollapse = true,
}: Props) {
  const { t } = useTranslation()
  const {
    batchIntervalMs,
    setBatchIntervalMs,
    nextBatchAtMs,
    isBatchRefreshing,
    runBatchNow,
  } = useStellar()
  const [currentTimeMs, setCurrentTimeMs] = useState(() => Date.now())

  useEffect(() => {
    const intervalID = window.setInterval(() => {
      setCurrentTimeMs(Date.now())
    }, BATCH_COUNTDOWN_REFRESH_MS)

    return () => window.clearInterval(intervalID)
  }, [])

  const nextBatchCountdown = getNextBatchCountdown(nextBatchAtMs, currentTimeMs)

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '9px 12px',
      background: 'var(--s-bg)',
      borderBottom: '1px solid var(--s-border)',
      flexShrink: 0,
    }}>
      <div style={{
        width: STELLAR_HEADER_STATUS_DOT_SIZE_PX,
        height: STELLAR_HEADER_STATUS_DOT_SIZE_PX,
        borderRadius: '50%',
        flexShrink: 0,
        background: isConnected ? 'var(--s-success)' : 'var(--s-text-dim)',
        boxShadow: isConnected ? '0 0 6px var(--s-success)' : 'none',
        transition: 'all 0.3s',
      }} />

      <span style={{
        fontFamily: 'var(--s-mono)',
        fontWeight: 700,
        fontSize: 12,
        letterSpacing: '0.12em',
        color: 'var(--s-brand)',
      }}>
        STELLAR
      </span>

      {clusterCount > 0 && (
        <span style={{
          fontFamily: 'var(--s-mono)',
          fontSize: 10,
          color: 'var(--s-text-muted)',
          background: 'var(--s-surface-2)',
          border: '1px solid var(--s-border-muted)',
          borderRadius: 'var(--s-rs)',
          padding: '1px 6px',
        }}>
          {t('stellar.header.clusterCount', { count: clusterCount })}
        </span>
      )}

      <div style={{ flex: 1 }} />

      <div className="flex items-center gap-2">
        <span className="text-[10px] text-muted-foreground" style={{
          fontFamily: 'var(--s-mono)',
          flexShrink: 0,
        }}>
          {t('stellar.header.nextBatch', { countdown: nextBatchCountdown })}
        </span>

        <div className="w-[78px]">
          <Select
            selectSize="sm"
            value={String(batchIntervalMs)}
            aria-label={t('stellar.header.batchIntervalLabel')}
            title={t('stellar.header.batchIntervalLabel')}
            className="border-[var(--s-border-muted)] bg-[var(--s-surface-2)] font-mono text-[10px] text-[var(--s-text)]"
            onChange={(event) => setBatchIntervalMs(Number(event.target.value))}
          >
            {STELLAR_BATCH_INTERVAL_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>
                {t(option.labelKey)}
              </option>
            ))}
          </Select>
        </div>

        <Button
          type="button"
          variant="secondary"
          size="sm"
          loading={isBatchRefreshing}
          onClick={() => void runBatchNow()}
          className="border border-[var(--s-border-muted)] bg-[var(--s-surface-2)] px-2 py-1 font-mono text-[10px] text-[var(--s-text)] hover:bg-[var(--s-surface)]"
        >
          {t('stellar.header.runNow')}
        </Button>
      </div>

      {unreadCount > 0 && (
        <div style={{
          background: 'var(--s-critical)',
          color: '#fff',
          borderRadius: STELLAR_HEADER_BADGE_RADIUS_PX,
          fontSize: 10,
          fontWeight: 700,
          padding: '1px 6px',
          minWidth: STELLAR_HEADER_UNREAD_BADGE_MIN_WIDTH_PX,
          textAlign: 'center',
        }}>
          {unreadCount}
        </div>
      )}

      {showCollapse && onCollapse && (
        <button
          onClick={onCollapse}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--s-text-dim)',
            fontSize: 14,
            padding: 2,
            lineHeight: 1,
            borderRadius: 'var(--s-rs)',
            transition: 'color var(--s-t)',
          }}
          title={t('actions.collapse')}
        >
          ▸
        </button>
      )}
    </div>
  )
}
