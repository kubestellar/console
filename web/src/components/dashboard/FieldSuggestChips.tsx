import { useMemo } from 'react'
import { detectFieldFormat } from '../../lib/ai/sampleData'
import { useAIMode } from '../../hooks/useAIMode'
import type { DynamicCardColumn } from '../../lib/dynamic-cards/types'

interface FieldSuggestChipsProps {
  dataJson: string
  existingFields: Set<string>
  onAddColumn: (col: DynamicCardColumn) => void
}

/**
 * Renders a row of "+ field" chips suggesting columns to add to a T1 card,
 * derived from the JSON sample data the author has supplied. Hidden when the
 * naturalLanguage AI feature is disabled or no novel fields are present.
 */
export function FieldSuggestChips({
  dataJson,
  existingFields,
  onAddColumn,
}: FieldSuggestChipsProps) {
  const { isFeatureEnabled } = useAIMode()
  const enabled = isFeatureEnabled('naturalLanguage')

  const suggestedFields = useMemo(() => {
    if (!enabled) return []
    try {
      const parsed = JSON.parse(dataJson)
      if (!Array.isArray(parsed) || parsed.length === 0) return []
      const allKeys = new Set<string>()
      for (const row of parsed.slice(0, 10)) {
        if (typeof row === 'object' && row) {
          Object.keys(row).forEach(k => allKeys.add(k))
        }
      }
      return [...allKeys].filter(k => !existingFields.has(k))
    } catch {
      return []
    }
  }, [dataJson, existingFields, enabled])

  if (!enabled || suggestedFields.length === 0) return null

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-xs text-muted-foreground/50">Fields:</span>
      {suggestedFields.map(field => {
        const sampleValues = (() => {
          try {
            const parsed = JSON.parse(dataJson)
            return parsed.slice(0, 5).map((row: Record<string, unknown>) => row[field])
          } catch { return [] }
        })()
        const detected = detectFieldFormat(field, sampleValues)

        return (
          <button
            key={field}
            onClick={() => onAddColumn({
              field,
              label: field.charAt(0).toUpperCase() + field.slice(1).replace(/([A-Z])/g, ' $1'),
              format: detected.format,
              badgeColors: detected.badgeColors,
            })}
            className="text-xs px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400/70 hover:bg-purple-500/20 hover:text-purple-400 transition-colors"
          >
            + {field}
          </button>
        )
      })}
    </div>
  )
}
