/**
 * TargetBalanceCharts
 *
 * Two stacked area charts (PRs and Issues) that visualize the projected
 * AI/Human balance at a given ACMM level. Driven by the slider in the
 * Recommendations card — as the user drags L1 → L5 the AI share for PRs
 * grows and the AI share for Issues shrinks, reflecting the model's
 * thesis that humans become direction-setters and AI becomes the
 * code-writer at higher maturity.
 *
 * The series are synthetic projections (not historical counts) because
 * detection is binary file-presence, not weekly volume. Charts are
 * labeled "Projected balance at L{n}" so it's clear they're aspirational.
 */

import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import {
  CHART_TOOLTIP_BG,
  CHART_TOOLTIP_BORDER,
  CHART_TOOLTIP_TEXT_COLOR,
  CHART_TICK_COLOR,
} from '../../lib/constants/ui'

/** Number of synthetic weekly data points in each area chart. */
const PROJECTION_WEEKS = 16
/** Total units used as the Y-axis ceiling (percentage scale). */
const SHARE_SCALE = 100
/** Chart row height in pixels (compact to fit both charts in the card). */
const CHART_HEIGHT_PX = 60
/** Title area offset in pixels (echarts grid.top). */
const CHART_TITLE_OFFSET_PX = 18
/** Title font size in pixels. */
const CHART_TITLE_FONT_SIZE = 10
/** Area fill opacity suffix appended to hex color (80% = CC). */
const AREA_OPACITY_HEX = 'CC'
/** Sine-wave amplitude (±5 pp) to give the area curve visual texture. */
const WAVE_AMPLITUDE = 0.05
/** Tooltip body font size in pixels. */
const TOOLTIP_FONT_SIZE = 11

/** AI share targets for PRs — climbs L1→L5. */
const PR_AI_SHARE_BY_LEVEL: Record<number, number> = {
  1: 0.10,
  2: 0.30,
  3: 0.55,
  4: 0.75,
  5: 0.90,
}
/** AI share targets for Issues — shrinks L1→L5 (humans set direction at L5). */
const ISSUE_AI_SHARE_BY_LEVEL: Record<number, number> = {
  1: 0.70,
  2: 0.55,
  3: 0.40,
  4: 0.25,
  5: 0.10,
}

/** Hex values for echarts (which doesn't resolve CSS variables).
 *  Purple = AI (matches the site primary); cyan = human (analytics convention). */
const AI_COLOR_HEX = '#a855f7' // ai-quality-ignore
const HUMAN_COLOR_HEX = '#06b6d4' // ai-quality-ignore

interface TargetBalanceChartsProps {
  level: number
}

/** Smooth wave around a target share so the area curve has visual texture
 *  rather than a flat band. Sinusoid with a small amplitude. */
function syntheticSeries(targetShare: number, total: number): number[] {
  const out: number[] = []
  for (let w = 0; w < PROJECTION_WEEKS; w++) {
    const t = w / (PROJECTION_WEEKS - 1)
    const wave = Math.sin(t * Math.PI * 2) * WAVE_AMPLITUDE // ai-quality-ignore
    const share = Math.max(0, Math.min(1, targetShare + wave))
    out.push(Math.round(share * total))
  }
  return out
}

function buildOption(label: string, aiShare: number, total: number) {
  const aiData = syntheticSeries(aiShare, total)
  const humanData = aiData.map((ai) => total - ai)
  const weeks = Array.from({ length: PROJECTION_WEEKS }, (_, i) => `W${i + 1}`)
  return {
    backgroundColor: 'transparent',
    grid: { left: 0, right: 0, top: CHART_TITLE_OFFSET_PX, bottom: 0 },
    xAxis: {
      type: 'category' as const,
      data: weeks,
      show: false,
      boundaryGap: false,
    },
    yAxis: {
      type: 'value' as const,
      show: false,
      max: total,
    },
    title: {
      text: label,
      left: 0,
      top: 0,
      textStyle: { color: CHART_TICK_COLOR, fontSize: CHART_TITLE_FONT_SIZE, fontWeight: 'normal' as const },
    },
    tooltip: {
      trigger: 'axis' as const,
      backgroundColor: CHART_TOOLTIP_BG,
      borderColor: CHART_TOOLTIP_BORDER,
      textStyle: { color: CHART_TOOLTIP_TEXT_COLOR, fontSize: TOOLTIP_FONT_SIZE },
    },
    series: [
      {
        name: 'AI',
        type: 'line' as const,
        stack: label,
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 0 },
        areaStyle: { color: AI_COLOR_HEX + AREA_OPACITY_HEX },
        data: aiData,
      },
      {
        name: 'Human',
        type: 'line' as const,
        stack: label,
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 0 },
        areaStyle: { color: HUMAN_COLOR_HEX + AREA_OPACITY_HEX },
        data: humanData,
      },
    ],
  }
}

export function TargetBalanceCharts({ level }: TargetBalanceChartsProps) {
  const prAiShare = PR_AI_SHARE_BY_LEVEL[level] ?? PR_AI_SHARE_BY_LEVEL[1]
  const issueAiShare = ISSUE_AI_SHARE_BY_LEVEL[level] ?? ISSUE_AI_SHARE_BY_LEVEL[1]

  const prOption = useMemo(() => buildOption('PRs (AI vs Human)', prAiShare, SHARE_SCALE), [prAiShare])
  const issueOption = useMemo(() => buildOption('Issues (AI vs Human)', issueAiShare, SHARE_SCALE), [issueAiShare])

  return (
    <div className="grid grid-cols-2 gap-2">
      <div>
        <ReactECharts
          option={prOption}
          notMerge={true}
          style={{ height: CHART_HEIGHT_PX, width: '100%' }}
          opts={{ renderer: 'svg' }}
        />
        <div className="text-[9px] text-muted-foreground mt-0.5">
          AI {Math.round(prAiShare * SHARE_SCALE)}% · Human {Math.round((1 - prAiShare) * SHARE_SCALE)}%
        </div>
      </div>
      <div>
        <ReactECharts
          option={issueOption}
          notMerge={true}
          style={{ height: CHART_HEIGHT_PX, width: '100%' }}
          opts={{ renderer: 'svg' }}
        />
        <div className="text-[9px] text-muted-foreground mt-0.5">
          AI {Math.round(issueAiShare * SHARE_SCALE)}% · Human {Math.round((1 - issueAiShare) * SHARE_SCALE)}%
        </div>
      </div>
    </div>
  )
}
