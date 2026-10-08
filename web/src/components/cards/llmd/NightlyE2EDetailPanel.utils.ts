import type { NightlyGuideStatus, NightlyRun } from '../../../lib/llmd/nightlyE2EDemoData'
import {
  MIN_RUNS_FOR_RATE,
  computeAvgDurationMin,
  formatDuration,
  getGuideMeta,
} from './nightlyE2E.constants'

export function generateNightlySummary(guides: NightlyGuideStatus[]): [string, string] {
  if (guides.length === 0) return ['No nightly E2E data available yet.', '']

  // Group by platform
  const byPlatform = new Map<string, NightlyGuideStatus[]>()
  for (const g of guides) {
    const list = byPlatform.get(g.platform) || []
    list.push(g)
    byPlatform.set(g.platform, list)
  }

  const allWithRuns = guides.filter(g => g.runs.length > 0)
  const totalPassing = allWithRuns.filter(g => g.latestConclusion === 'success').length
  const totalWithRuns = allWithRuns.length
  const overallPct = totalWithRuns > 0
    ? Math.round((allWithRuns.reduce((s, g) => s + g.passRate, 0)) / totalWithRuns)
    : 0

  // Compute duration stats across all completed runs
  const allCompletedRuns = allWithRuns.flatMap(g => g.runs.filter(r => r.status === 'completed'))
  const avgDuration = computeAvgDurationMin(allCompletedRuns)

  // Collect unique models and GPU types across active guides
  const modelSet = new Set<string>()
  const gpuTypeSet = new Set<string>()
  let totalGpus = 0
  for (const g of allWithRuns) {
    const meta = getGuideMeta(g)
    if (meta.model !== 'Unknown' && meta.model !== 'Simulated') modelSet.add(meta.model)
    if (meta.gpuType !== 'Unknown' && meta.gpuType !== 'CPU' && meta.gpuType !== 'TBD') gpuTypeSet.add(meta.gpuType)
    totalGpus += meta.gpuCount
  }

  // Paragraph 1: Overall health + infrastructure context
  const para1Parts: string[] = []

  if (totalWithRuns === 0) {
    para1Parts.push('No workflow runs have been recorded yet across any platform.')
  } else {
    para1Parts.push(`Across ${totalWithRuns} active guides, ${totalPassing} are currently passing with an average pass rate of ${overallPct}%.`)

    // Duration + infrastructure sentence
    const infraParts: string[] = []
    if (avgDuration !== null) infraParts.push(`Tests average ${formatDuration(avgDuration)} to complete`)
    if (modelSet.size > 0) infraParts.push(`exercising ${modelSet.size} model${modelSet.size > 1 ? 's' : ''} (${[...modelSet].slice(0, 3).join(', ')}${modelSet.size > 3 ? '…' : ''})`)
    if (gpuTypeSet.size > 0) infraParts.push(`across ${totalGpus} ${[...gpuTypeSet].join('/')} GPUs`)
    if (infraParts.length > 0) para1Parts.push(infraParts.join(' ') + '.')

    for (const [platform, pGuides] of byPlatform) {
      const withRuns = pGuides.filter(g => g.runs.length > 0)
      if (withRuns.length === 0) {
        para1Parts.push(`${platform} has no workflows created yet.`)
        continue
      }
      const passing = withRuns.filter(g => g.latestConclusion === 'success').length
      const total = withRuns.length
      const avgRate = Math.round(withRuns.reduce((s, g) => s + g.passRate, 0) / total)
      const trendingUp = withRuns.filter(g => g.trend === 'up').length
      const running = withRuns.filter(g => g.runs.some(r => r.status === 'in_progress')).length

      if (passing === 0 && total > 1) {
        const suffix = running > 0 ? `, though ${running} ${running === 1 ? 'is' : 'are'} currently running` : ''
        para1Parts.push(`${platform} is at 0% across all ${total} guides${suffix} — likely an infrastructure issue.`)
      } else if (passing === total) {
        para1Parts.push(`${platform} is fully green with all ${total} guides passing (avg ${avgRate}%).`)
      } else {
        const trendNote = trendingUp > 0 ? ` with ${trendingUp} trending upward` : ''
        para1Parts.push(`${platform} has ${passing}/${total} guides passing (avg ${avgRate}%)${trendNote}.`)
      }
    }
  }

  // Count GPU failures across all runs
  const gpuFailCount = allWithRuns.flatMap(g => g.runs)
    .filter(r => r.failureReason === 'gpu_unavailable').length
  if (gpuFailCount > 0) {
    para1Parts.push(`${gpuFailCount} recent failure${gpuFailCount > 1 ? 's were' : ' was'} due to GPU unavailability (shown in amber).`)
  }

  // Paragraph 2: Notable patterns + per-guide duration outliers
  const para2Parts: string[] = []

  if (allWithRuns.length > 0) {
    const best = allWithRuns.reduce((a, b) => a.passRate > b.passRate ? a : b)
    const worst = allWithRuns.filter(g => g.runs.length >= MIN_RUNS_FOR_RATE).reduce(
      (a, b) => a.passRate < b.passRate ? a : b, allWithRuns[0]
    )

    if (best.passRate > 0) {
      const meta = getGuideMeta(best)
      const dur = computeAvgDurationMin(best.runs.filter(r => r.status === 'completed'))
      const durStr = dur !== null ? ` (avg ${formatDuration(dur)}, ${meta.model} on ${meta.gpuCount}× ${meta.gpuType})` : ''
      para2Parts.push(`${best.acronym} (${best.platform}) leads at ${best.passRate}%${durStr}.`)
    }
    if (worst.passRate === 0 && worst.runs.length >= MIN_RUNS_FOR_RATE) {
      para2Parts.push(`${worst.acronym} (${worst.platform}) has never passed in ${worst.runs.length} runs and needs investigation.`)
    }

    // Find slowest guide
    if (avgDuration !== null) {
      let slowest: { g: NightlyGuideStatus; dur: number } | null = null
      for (const g of allWithRuns) {
        const d = computeAvgDurationMin(g.runs.filter(r => r.status === 'completed'))
        if (d !== null && (slowest === null || d > slowest.dur)) slowest = { g, dur: d }
      }
      if (slowest && slowest.dur > avgDuration * 1.5) {
        const meta = getGuideMeta(slowest.g)
        para2Parts.push(`${slowest.g.acronym} (${slowest.g.platform}) is the slowest at ${formatDuration(slowest.dur)} avg, running ${meta.model} on ${meta.gpuCount}× ${meta.gpuType}.`)
      }
    }
  }

  // Streaks
  for (const g of allWithRuns) {
    let streak = 0
    let sType: 'success' | 'failure' | null = null
    for (const r of g.runs) {
      if (r.status !== 'completed') continue
      if (!sType) sType = r.conclusion === 'success' ? 'success' : 'failure'
      if ((sType === 'success' && r.conclusion === 'success') ||
          (sType === 'failure' && r.conclusion !== 'success')) {
        streak++
      } else break
    }
    if (sType === 'success' && streak >= 3) {
      para2Parts.push(`${g.acronym} (${g.platform}) has ${streak} consecutive ${streak === 1 ? 'pass' : 'passes'}.`)
    } else if (sType === 'failure' && streak >= 3 && g.runs.some(r => r.conclusion === 'success')) {
      para2Parts.push(`${g.acronym} (${g.platform}) has regressed with ${streak} consecutive ${streak === 1 ? 'failure' : 'failures'}.`)
    }
  }

  // Currently running
  const runningGuides = allWithRuns.filter(g => g.runs.some(r => r.status === 'in_progress'))
  if (runningGuides.length > 0) {
    const names = runningGuides.map(g => {
      const meta = getGuideMeta(g)
      return `${g.acronym} (${g.platform}, ${meta.model})`
    }).join(', ')
    para2Parts.push(`Currently running: ${names}.`)
  }

  const p1 = para1Parts.join(' ')
  const p2 = para2Parts.length > 0 ? para2Parts.join(' ') : 'No notable patterns detected in recent runs.'

  return [p1, p2]
}

export function computeRunDurationMin(run: NightlyRun): number | null {
  if (run.status !== 'completed' || !run.createdAt || !run.updatedAt) return null
  return Math.round((new Date(run.updatedAt).getTime() - new Date(run.createdAt).getTime()) / 60_000)
}
