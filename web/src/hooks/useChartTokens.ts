import { useEffect, useState } from 'react'
import { useTheme } from '../contexts/ThemeContext'
import {
  getChartTextMuted,
  getChartAxisStroke,
  getChartGridStroke,
  getChartTickColor } from '../lib/chartColors'

export interface ChartTokens {
  /** Muted secondary text for chart labels and axis names */
  textMuted: string
  /** Axis line stroke */
  axisStroke: string
  /** Grid / split line stroke */
  gridStroke: string
  /** Axis tick label color */
  tickColor: string
}

function readChartTokens(): ChartTokens {
  return {
    textMuted: getChartTextMuted(),
    axisStroke: getChartAxisStroke(),
    gridStroke: getChartGridStroke(),
    tickColor: getChartTickColor(),
  }
}

function sameTokens(a: ChartTokens, b: ChartTokens): boolean {
  return a.textMuted === b.textMuted
    && a.axisStroke === b.axisStroke
    && a.gridStroke === b.gridStroke
    && a.tickColor === b.tickColor
}

/**
 * Live chart CSS tokens for ECharts options (canvas can't resolve `var(--…)`).
 *
 * The `CHART_*` constants in `lib/constants/ui.ts` are read once at module load,
 * so options built from them ignore runtime theme switches. This hook re-reads
 * the tokens in a passive effect keyed on the theme id — after ThemeProvider's
 * layout effect has written the new CSS variables — and only re-renders when a
 * value actually changed.
 */
export function useChartTokens(): ChartTokens {
  const { themeId } = useTheme()
  const [tokens, setTokens] = useState<ChartTokens>(readChartTokens)

  useEffect(() => {
    const next = readChartTokens()
    setTokens(prev => (sameTokens(prev, next) ? prev : next))
  }, [themeId])

  return tokens
}
