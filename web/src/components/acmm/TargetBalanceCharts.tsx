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

const WEEKS = 16
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
const AI_COLOR = '#a855f7' // primary purple
const HUMAN_COLOR = '#06b6d4' // cyan

interface TargetBalanceChartsProps {
  level: number
}

/** Smooth wave around a target share so the area curve has visual texture
 *  rather than a flat band. Sinusoid with a small amplitude (±5 pp). */
function syntheticSeries(targetShare: number, total: number): number[] {
  const amplitude = 0.05
  const out: number[] = []
  for (let w = 0; w < WEEKS; w++) {
    const t = w / (WEEKS - 1)
    const wave = Math.sin(t * Math.PI * 2) * amplitude
    const share = Math.max(0, Math.min(1, targetShare + wave))
    out.push(Math.round(share * total))
  }
  return out
}

function buildOption(label: string, aiShare: number, total: number) {
  const aiData = syntheticSeries(aiShare, total)
  const humanData = aiData.map((ai) => total - ai)
  const weeks = Array.from({ length: WEEKS }, (_, i) => `W${i + 1}`)
  return {
    backgroundColor: 'transparent',
    grid: { left: 0, right: 0, top: 18, bottom: 0 },
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
      textStyle: { color: '#888', fontSize: 10, fontWeight: 'normal' as const },
    },
    tooltip: {
      trigger: 'axis' as const,
      backgroundColor: '#1f1f1f',
      borderColor: '#333',
      textStyle: { color: '#e5e5e5', fontSize: 11 },
    },
    series: [
      {
        name: 'AI',
        type: 'line' as const,
        stack: label,
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 0 },
        areaStyle: { color: AI_COLOR + 'CC' },
        data: aiData,
      },
      {
        name: 'Human',
        type: 'line' as const,
        stack: label,
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 0 },
        areaStyle: { color: HUMAN_COLOR + 'CC' },
        data: humanData,
      },
    ],
  }
}

export function TargetBalanceCharts({ level }: TargetBalanceChartsProps) {
  const prAiShare = PR_AI_SHARE_BY_LEVEL[level] ?? PR_AI_SHARE_BY_LEVEL[1]
  const issueAiShare = ISSUE_AI_SHARE_BY_LEVEL[level] ?? ISSUE_AI_SHARE_BY_LEVEL[1]

  const prOption = useMemo(() => buildOption('PRs (AI vs Human)', prAiShare, 100), [prAiShare])
  const issueOption = useMemo(() => buildOption('Issues (AI vs Human)', issueAiShare, 100), [issueAiShare])

  return (
    <div className="grid grid-cols-2 gap-2">
      <div>
        <ReactECharts
          option={prOption}
          notMerge={true}
          style={{ height: 60, width: '100%' }}
          opts={{ renderer: 'svg' }}
        />
        <div className="text-[9px] text-muted-foreground mt-0.5">
          AI {Math.round(prAiShare * 100)}% · Human {Math.round((1 - prAiShare) * 100)}%
        </div>
      </div>
      <div>
        <ReactECharts
          option={issueOption}
          notMerge={true}
          style={{ height: 60, width: '100%' }}
          opts={{ renderer: 'svg' }}
        />
        <div className="text-[9px] text-muted-foreground mt-0.5">
          AI {Math.round(issueAiShare * 100)}% · Human {Math.round((1 - issueAiShare) * 100)}%
        </div>
      </div>
    </div>
  )
}
