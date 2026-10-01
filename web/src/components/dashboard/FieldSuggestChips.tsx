import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()
  const { isFeatureEnabled } = useAIMode()
  const enabled = isFeatureEnabled('naturalLanguage')

  // Parse once and reuse the result for both the suggested-field list and the
  // per-field sample values below, so a parse failure only needs to be
  // surfaced in one place instead of swallowed separately in two.
  const { rows, parseFailed } = useMemo(() => {
    if (!enabled || dataJson.trim().length === 0) {
      return { rows: [] as Record<string, unknown>[], parseFailed: false }
    }
    try {
      const parsed = JSON.parse(dataJson)
      if (!Array.isArray(parsed)) return { rows: [], parseFailed: true }
      return { rows: parsed as Record<string, unknown>[], parseFailed: false }
    } catch {
      // The author is often mid-edit when this runs, so partial/invalid JSON
      // is expected — degrade to an inline notice below instead of throwing,
      // but don't pretend nothing is wrong (#23869).
      return { rows: [], parseFailed: true }
    }
  }, [dataJson, enabled])

  const suggestedFields = useMemo(() => {
    if (rows.length === 0) return []
    const allKeys = new Set<string>()
    for (const row of rows.slice(0, 10)) {
      if (typeof row === 'object' && row) {
        Object.keys(row).forEach(k => allKeys.add(k))
      }
    }
    return [...allKeys].filter(k => !existingFields.has(k))
  }, [rows, existingFields])

  if (!enabled) return null

  if (parseFailed) {
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-xs text-amber-500/70">
          {t('dashboard.fieldSuggestions.invalidJson')}
        </span>
      </div>
    )
  }

  if (suggestedFields.length === 0) return null

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-xs text-muted-foreground/50">Fields:</span>
      {suggestedFields.map(field => {
        const sampleValues = rows.slice(0, 5).map(row => row[field])
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
