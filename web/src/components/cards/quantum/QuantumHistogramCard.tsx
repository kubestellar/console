import { type CSSProperties, useMemo, useState } from 'react'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { LazyEChart } from '../../charts/LazyEChart'
import { useCardLoadingState } from '../CardDataContext'
import { Button } from '../../ui/Button'
import { Skeleton } from '../../ui/Skeleton'
import { Slider } from '../../ui/Slider'
import { useResultHistogram, type HistogramSort } from '../../../hooks/useResultHistogram'
import { useAuth } from '../../../lib/auth'
import { getChartColor } from '../../../lib/chartColors'
import {
  CHART_AXIS_FONT_SIZE,
  CHART_GRID_STROKE,
  CHART_TEXT_MUTED,
  CHART_TICK_COLOR,
  CHART_TOOLTIP_LABEL_COLOR,
  CHART_TOOLTIP_TEXT_COLOR,
} from '../../../lib/constants'

const HISTOGRAM_DEFAULT_POLL_MS = 10_000
const HISTOGRAM_POLL_MIN_MS = 2_000
const HISTOGRAM_POLL_MAX_MS = 30_000
const HISTOGRAM_POLL_STEP_MS = 500
const HISTOGRAM_CHART_HEIGHT_PX = 300
const HISTOGRAM_AXIS_LABEL_ROTATION_DEG = 45
const HISTOGRAM_BAR_BORDER_RADIUS: [number, number, number, number] = [6, 6, 0, 0]
const HISTOGRAM_BAR_MAX_WIDTH_PX = 48
const HISTOGRAM_TOOLTIP_PERCENTAGE_MULTIPLIER = 100
const HISTOGRAM_PROBABILITY_DECIMALS = 1
const HISTOGRAM_NO_VALUE = '—'
const HISTOGRAM_COLOR_COUNT = 8
const HISTOGRAM_REFRESH_ICON_SIZE_PX = 16
const HISTOGRAM_SKELETON_TITLE_WIDTH_PX = 180
const HISTOGRAM_SKELETON_TITLE_HEIGHT_PX = 24
const HISTOGRAM_SKELETON_ACTION_SIZE_PX = 32
const HISTOGRAM_SKELETON_CONTROL_HEIGHT_PX = 36
const HISTOGRAM_SKELETON_METADATA_HEIGHT_PX = 64
const HISTOGRAM_COLOR_PALETTE = Array.from(
  { length: HISTOGRAM_COLOR_COUNT },
  (_, index) => getChartColor(index + 1),
)
const CHART_STYLE: CSSProperties = { height: '100%', width: '100%' }

interface HistogramTooltipParam {
  dataIndex: number
  value: number
}

function isHistogramTooltipParam(value: unknown): value is HistogramTooltipParam {
  return typeof value === 'object'
    && value !== null
    && 'dataIndex' in value
    && typeof value.dataIndex === 'number'
    && 'value' in value
    && typeof value.value === 'number'
}

function formatExecutionTime(timestamp: string | null): string | null {
  if (!timestamp) {
    return null
  }

  const parsed = new Date(timestamp)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toLocaleTimeString()
}

function HistogramLoadingState() {
  return (
    <div className="p-4 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <Skeleton variant="text" width={HISTOGRAM_SKELETON_TITLE_WIDTH_PX} height={HISTOGRAM_SKELETON_TITLE_HEIGHT_PX} />
        <Skeleton variant="circular" width={HISTOGRAM_SKELETON_ACTION_SIZE_PX} height={HISTOGRAM_SKELETON_ACTION_SIZE_PX} />
      </div>
      <div className="flex gap-2">
        <Skeleton variant="rounded" className="flex-1" height={HISTOGRAM_SKELETON_CONTROL_HEIGHT_PX} />
        <Skeleton variant="rounded" className="flex-1" height={HISTOGRAM_SKELETON_CONTROL_HEIGHT_PX} />
      </div>
      <Skeleton variant="rounded" height={HISTOGRAM_SKELETON_METADATA_HEIGHT_PX} />
      <Skeleton variant="rounded" height={HISTOGRAM_CHART_HEIGHT_PX} />
    </div>
  )
}

function HistogramMetadata({
  label,
  value,
}: {
  label: string
  value: number | string
}) {
  return (
    <div className="rounded-lg border border-border bg-secondary/20 px-3 py-2">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-medium text-foreground">{value}</div>
    </div>
  )
}

export function QuantumHistogramCard() {
  const { t } = useTranslation(['cards', 'common'])
  const { isAuthenticated, login, isLoading: authIsLoading } = useAuth()
  const [sortBy, setSortBy] = useState<HistogramSort>('count')
  const [refreshInterval, setRefreshInterval] = useState(HISTOGRAM_DEFAULT_POLL_MS)
  const {
    data,
    isLoading,
    isRefreshing,
    isDemoData,
    error,
    isFailed,
    consecutiveFailures,
    lastRefresh,
    refetch,
  } = useResultHistogram(sortBy, refreshInterval)

  const histogramEntries = data?.histogram || []
  const hasAnyData = histogramEntries.length > 0
  const executionTime = formatExecutionTime(data?.timestamp ?? null)
  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: isLoading && !hasAnyData,
    hasAnyData,
    isFailed,
    consecutiveFailures,
    errorMessage: error || undefined,
    isDemoData,
    isRefreshing,
    lastRefresh,
  })

  const chartOption = useMemo(() => {
    const labels = histogramEntries.map(entry => entry.pattern)
    const counts = histogramEntries.map(entry => entry.count)

    return {
      color: HISTOGRAM_COLOR_PALETTE,
      grid: {
        left: '10%',
        right: '6%',
        top: '8%',
        bottom: '18%',
        containLabel: true,
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: unknown) => {
          if (!Array.isArray(params) || params.length === 0 || !isHistogramTooltipParam(params[0])) {
            return ''
          }

          const selectedEntry = histogramEntries[params[0].dataIndex]
          if (!selectedEntry) {
            return ''
          }

          return [
            `<strong style="color:${CHART_TOOLTIP_TEXT_COLOR}">${t('cards:quantumHistogram.tooltipPattern')}</strong> ${selectedEntry.pattern}`,
            `<strong style="color:${CHART_TOOLTIP_TEXT_COLOR}">${t('cards:quantumHistogram.tooltipCount')}</strong> ${selectedEntry.count}`,
            `<strong style="color:${CHART_TOOLTIP_TEXT_COLOR}">${t('cards:quantumHistogram.tooltipProbability')}</strong> ${(selectedEntry.probability * HISTOGRAM_TOOLTIP_PERCENTAGE_MULTIPLIER).toFixed(HISTOGRAM_PROBABILITY_DECIMALS)}%`,
          ].join('<br/>')
        },
        textStyle: {
          color: CHART_TOOLTIP_LABEL_COLOR,
        },
      },
      xAxis: {
        type: 'category',
        data: labels,
        axisLabel: {
          rotate: HISTOGRAM_AXIS_LABEL_ROTATION_DEG,
          interval: 0,
          color: CHART_TEXT_MUTED,
          fontSize: CHART_AXIS_FONT_SIZE,
        },
        axisLine: {
          lineStyle: {
            color: CHART_GRID_STROKE,
          },
        },
        axisTick: {
          lineStyle: {
            color: CHART_TICK_COLOR,
          },
        },
      },
      yAxis: {
        type: 'value',
        name: t('cards:quantumHistogram.yAxisLabel'),
        nameTextStyle: {
          color: CHART_TEXT_MUTED,
        },
        axisLabel: {
          color: CHART_TEXT_MUTED,
          fontSize: CHART_AXIS_FONT_SIZE,
        },
        splitLine: {
          lineStyle: {
            color: CHART_GRID_STROKE,
          },
        },
      },
      series: [
        {
          type: 'bar',
          barMaxWidth: HISTOGRAM_BAR_MAX_WIDTH_PX,
          data: counts,
          itemStyle: {
            borderRadius: HISTOGRAM_BAR_BORDER_RADIUS,
            color: (params: { dataIndex: number }) => HISTOGRAM_COLOR_PALETTE[params.dataIndex % HISTOGRAM_COLOR_PALETTE.length],
          },
        },
      ],
    }
  }, [histogramEntries, t])

  const metadata = useMemo(() => ([
    {
      label: t('cards:quantumHistogram.patternsLabel'),
      value: data?.num_patterns ?? 0,
    },
    {
      label: t('cards:quantumHistogram.totalShotsLabel'),
      value: data?.total_shots ?? 0,
    },
    {
      label: t('cards:quantumHistogram.qubitsLabel'),
      value: data?.num_qubits ?? HISTOGRAM_NO_VALUE,
    },
  ]), [data?.num_patterns, data?.num_qubits, data?.total_shots, t])

  if (authIsLoading || showSkeleton) {
    return <HistogramLoadingState />
  }

  if (!isAuthenticated) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-sm text-muted-foreground">{t('cards:quantumHistogram.loginPrompt')}</p>
        <Button variant="primary" size="lg" onClick={login}>
          {t('common:login.continueWithGitHub')}
        </Button>
      </div>
    )
  }

  return (
    <div className="p-4 flex h-full flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-lg font-semibold text-foreground">{t('cards:quantumHistogram.title')}</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => { void refetch() }}
          disabled={isLoading}
          title={t('cards:quantumHistogram.refresh')}
          icon={<RefreshCw size={HISTOGRAM_REFRESH_ICON_SIZE_PX} className={isRefreshing ? 'animate-spin' : undefined} />}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button
          variant={sortBy === 'count' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => setSortBy('count')}
        >
          {t('cards:quantumHistogram.sortByFrequency')}
        </Button>
        <Button
          variant={sortBy === 'pattern' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => setSortBy('pattern')}
        >
          {t('cards:quantumHistogram.sortByPattern')}
        </Button>
      </div>

      <div className="rounded-lg border border-border bg-secondary/30 p-3">
        <Slider
          label={t('cards:quantumHistogram.refreshInterval')}
          value={refreshInterval}
          onChange={(event) => setRefreshInterval(Number(event.currentTarget.value))}
          min={HISTOGRAM_POLL_MIN_MS}
          max={HISTOGRAM_POLL_MAX_MS}
          step={HISTOGRAM_POLL_STEP_MS}
          formatValue={(value) => t('cards:quantumHistogram.refreshValue', { count: value })}
        />
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {showEmptyState ? (
        <div className="flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-secondary/10 px-4 py-8 text-center">
          <p className="text-sm font-medium text-foreground">{t('cards:quantumHistogram.emptyTitle')}</p>
          <p className="mt-2 text-xs text-muted-foreground">{t('cards:quantumHistogram.emptyHint')}</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {metadata.map(item => (
              <HistogramMetadata key={item.label} label={item.label} value={item.value} />
            ))}
          </div>

          <div className="flex-1" style={{ minHeight: HISTOGRAM_CHART_HEIGHT_PX }}>
            <LazyEChart option={chartOption} style={CHART_STYLE} />
          </div>
        </>
      )}

      {executionTime && (
        <div className="text-center text-xs text-muted-foreground">
          {t('cards:quantumHistogram.lastExecution', { time: executionTime })}
        </div>
      )}
    </div>
  )
}
