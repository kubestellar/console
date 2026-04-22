/**
 * useACMMStats
 *
 * Provides stat block values for the ACMM dashboard Stats Overview bar.
 * Reads from useACMM() context so values update instantly when the user
 * picks a different repo.
 */

import { useCallback } from 'react'
import type { StatBlockValue } from '../ui/StatsOverview'
import { useACMM } from './ACMMProvider'
import { ALL_CRITERIA } from '../../lib/acmm/sources'
import { MAX_LEVEL } from '../../lib/acmm/computeLevel'
import type { SourceId } from '../../lib/acmm/sources/types'

/** Source IDs in display order. */
const SOURCE_IDS: SourceId[] = ['acmm', 'fullsend', 'agentic-engineering-framework', 'claude-reflect']
const SOURCE_NAMES: Record<SourceId, string> = {
  acmm: 'ACMM',
  fullsend: 'Fullsend',
  'agentic-engineering-framework': 'AEF',
  'claude-reflect': 'Claude Reflect',
}

export function useACMMStats() {
  const { scan } = useACMM()
  const { level, data } = scan
  const detectedIds = data.detectedIds

  const totalCriteria = ALL_CRITERIA.length
  const detectedCount = detectedIds instanceof Set ? detectedIds.size : (detectedIds as string[] || []).length // ai-quality-ignore

  const nextLevel = level.level < MAX_LEVEL ? level.level + 1 : null
  const nextRequired = nextLevel ? level.requiredByLevel[nextLevel] ?? 0 : 0
  const nextDetected = nextLevel ? level.detectedByLevel[nextLevel] ?? 0 : 0
  const nextRemaining = nextRequired - nextDetected

  const getStatValue = useCallback((blockId: string): StatBlockValue => {
    switch (blockId) {
      case 'acmm_level':
        return {
          value: level.level,
          sublabel: level.levelName,
          max: MAX_LEVEL,
          format: (v: number) => `L${v}`,
        }
      case 'acmm_detected':
        return {
          value: detectedCount,
          sublabel: `${detectedCount} of ${totalCriteria} criteria`,
          max: totalCriteria,
        }
      case 'acmm_next_level':
        if (!nextLevel) {
          return { value: MAX_LEVEL, sublabel: `L${MAX_LEVEL} reached`, max: MAX_LEVEL, format: (v: number) => `L${v}` }
        }
        return {
          value: nextDetected,
          sublabel: `${nextRemaining} more for L${nextLevel}`,
          max: nextRequired,
        }
      case 'acmm_by_source': {
        const segments = SOURCE_IDS.map((sid) => {
          const srcCriteria = ALL_CRITERIA.filter((c) => c.source === sid)
          const srcDetected = srcCriteria.filter((c) =>
            detectedIds instanceof Set ? detectedIds.has(c.id) : (detectedIds as string[] || []).includes(c.id), // ai-quality-ignore
          ).length
          return {
            label: SOURCE_NAMES[sid],
            value: srcCriteria.length > 0 ? Math.round((srcDetected / srcCriteria.length) * 100) : 0, // ai-quality-ignore
          }
        })
        const bestSource = segments.reduce((a, b) => (b.value > a.value ? b : a), segments[0])
        return {
          value: `${bestSource?.value ?? 0}%`, // ai-quality-ignore
          sublabel: `${bestSource?.label ?? '-'} (${segments.length} sources)`,
        }
      }
      default:
        return { value: '-' }
    }
  }, [level, detectedCount, totalCriteria, nextLevel, nextDetected, nextRemaining, nextRequired, detectedIds])

  return { getStatValue }
}
