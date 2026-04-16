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
import type { SourceId } from '../../lib/acmm/sources/types'

const MAX_LEVEL = 5

/** Source IDs in display order. */
const SOURCE_IDS: SourceId[] = ['acmm', 'fullsend', 'agentic-engineering-framework', 'claude-reflect']
const SOURCE_SHORT_NAMES: Record<SourceId, string> = {
  acmm: 'ACMM',
  fullsend: 'FS',
  'agentic-engineering-framework': 'AEF',
  'claude-reflect': 'Refl',
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
        }
      case 'acmm_detected':
        return {
          value: detectedCount,
          sublabel: `of ${totalCriteria}`,
          max: totalCriteria,
        }
      case 'acmm_next_level':
        if (!nextLevel) {
          return { value: MAX_LEVEL, sublabel: 'Max level', max: MAX_LEVEL }
        }
        return {
          value: nextDetected,
          sublabel: `${nextRemaining} to L${nextLevel}`,
          max: nextRequired,
        }
      case 'acmm_by_source': {
        // Build per-source detection ratios for the mini-bar visualization
        const segments = SOURCE_IDS.map((sid) => {
          const srcCriteria = ALL_CRITERIA.filter((c) => c.source === sid)
          const srcDetected = srcCriteria.filter((c) =>
            detectedIds instanceof Set ? detectedIds.has(c.id) : (detectedIds as string[] || []).includes(c.id), // ai-quality-ignore
          ).length
          return {
            label: SOURCE_SHORT_NAMES[sid],
            value: srcCriteria.length > 0 ? Math.round((srcDetected / srcCriteria.length) * 100) : 0, // ai-quality-ignore
          }
        })
        const bestSource = segments.reduce((a, b) => (b.value > a.value ? b : a), segments[0])
        return {
          value: `${bestSource?.value ?? 0}%`, // ai-quality-ignore
          sublabel: `Best: ${bestSource?.label ?? '-'}`,
        }
      }
      default:
        return { value: '-' }
    }
  }, [level, detectedCount, totalCriteria, nextLevel, nextDetected, nextRemaining, nextRequired, detectedIds])

  return { getStatValue }
}
