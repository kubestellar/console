import { useEffect, useRef, useState } from 'react'
import { Code, Layers, LayoutTemplate } from 'lucide-react'
import { cn } from '../../lib/cn'
import { StatusBadge } from '../ui/StatusBadge'
import { wrapAbbreviations } from '../shared/TechnicalAcronym'
import type { AiCardT1Result, AiCardT2Result } from './cardFactoryAiTypes'

// ============================================================================
// Template Dropdown (generic) + AI result previews
// ============================================================================
//
// Presentational helpers used by CardFactoryModal:
//  - TemplateDropdown: generic template picker rendered in the Declarative and
//    Code tabs.
//  - T1Preview / T2Preview: render the AI generation result in the AI tab's
//    preview pane.

export function TemplateDropdown<T extends { name: string }>({
  templates,
  onSelect,
  label }: {
  templates: T[]
  onSelect: (tpl: T) => void
  label: string
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-secondary text-muted-foreground hover:text-foreground transition-colors"
      >
        <LayoutTemplate className="w-3 h-3" />
        {label}
      </button>
      {open && (
        <div className="absolute z-dropdown top-full mt-1 left-0 bg-card border border-border rounded-lg shadow-lg p-1.5 min-w-[200px]">
          {templates.map(tpl => (
            <button
              key={tpl.name}
              onClick={() => { onSelect(tpl); setOpen(false) }}
              className="w-full text-left px-3 py-1.5 rounded-lg text-xs text-foreground hover:bg-secondary transition-colors"
            >
              {tpl.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function T1Preview({ result }: { result: AiCardT1Result }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Layers className="w-4 h-4 text-purple-400" />
        <span className="text-sm font-medium text-foreground">{result.title}</span>
        <StatusBadge color="blue" size="xs">
          {result.layout}
        </StatusBadge>
      </div>
      {result.description && (
        <p className="text-xs text-muted-foreground mb-3">{wrapAbbreviations(result.description)}</p>
      )}
      {result.columns && result.columns.length > 0 && (
        <div className="text-xs">
          <div className="flex gap-2 border-b border-border pb-1 mb-1">
            {result.columns.map(col => (
              <span key={col.field} className="flex-1 text-muted-foreground font-medium truncate">
                {wrapAbbreviations(col.label)}
              </span>
            ))}
          </div>
          {(result.staticData || []).slice(0, 3).map((row, i) => (
            <div key={i} className="flex gap-2 py-0.5">
              {result.columns.map(col => {
                const val = String(row[col.field] ?? '')
                if (col.format === 'badge' && col.badgeColors) {
                  const badgeClass = col.badgeColors[val] || 'bg-gray-500/20 text-muted-foreground dark:bg-gray-900/30 dark:text-muted-foreground'
                  return (
                    <span key={col.field} className={cn('flex-1 truncate text-xs px-1 py-0.5 rounded', badgeClass)}>
                      {val}
                    </span>
                  )
                }
                return (
                  <span key={col.field} className="flex-1 text-foreground truncate">
                    {val}
                  </span>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function T2Preview({ result }: { result: AiCardT2Result }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Code className="w-4 h-4 text-purple-400" />
        <span className="text-sm font-medium text-foreground">{result.title}</span>
        <StatusBadge color="purple" size="xs">
          Custom Code
        </StatusBadge>
      </div>
      {result.description && (
        <p className="text-xs text-muted-foreground mb-2">{wrapAbbreviations(result.description)}</p>
      )}
      <pre className="text-xs px-3 py-2 rounded-lg bg-secondary text-foreground font-mono max-h-48 overflow-y-auto whitespace-pre-wrap">
        {result.sourceCode}
      </pre>
    </div>
  )
}
