import { CheckCircle2, XCircle } from 'lucide-react'

import { ACCENT_CLASSES, type AccentColor } from './styles'

export interface ComparisonRow {
  feature: string
  competitor: string | boolean
  console: string | boolean
  competitorNote?: string
  consoleNote?: string
}

interface ComparisonTableProps {
  rows: ComparisonRow[]
  competitorName: string
  competitorSubtitle?: string
  accentColor: AccentColor
  title?: string
  subtitle?: string
  variant?: 'standard' | 'holmes'
}

function ComparisonCell(
  { value, note, highlightStyle }:
  { value: string | boolean; note?: string; highlightStyle?: 'green' | 'accent' }
) {
  const textClass = highlightStyle === 'accent' ? 'text-teal-400 font-medium' : 'text-green-400 font-medium'
  const iconClass = highlightStyle === 'accent' ? 'text-teal-400' : 'text-green-400'

  if (typeof value === 'boolean') {
    return value ? (
      <span className="inline-flex items-center gap-1.5">
        <CheckCircle2 className={`w-5 h-5 ${highlightStyle ? iconClass : 'text-muted-foreground'}`} />
        <span className="sr-only">Yes</span>
        {note && <span className="text-xs text-muted-foreground">{note}</span>}
      </span>
    ) : (
      <span className="inline-flex items-center gap-1.5">
        <XCircle className="w-5 h-5 text-red-400/70" />
        <span className="sr-only">No</span>
      </span>
    )
  }

  return (
    <span className="inline-flex flex-col">
      <span className={highlightStyle ? textClass : 'text-slate-300'}>{value}</span>
      {note && <span className="text-xs text-muted-foreground">{note}</span>}
    </span>
  )
}

export function ComparisonTable({
  rows,
  competitorName,
  competitorSubtitle,
  accentColor,
  title = 'Side-by-side comparison',
  subtitle,
  variant = 'standard',
}: ComparisonTableProps) {
  const accent = ACCENT_CLASSES[accentColor]
  const consoleHighlightStyle = accentColor === 'teal' ? 'accent' : 'green'

  if (variant === 'holmes') {
    return (
      <section className="max-w-5xl mx-auto px-6 py-16">
        <h2 className="text-3xl font-bold text-center mb-12">
          {title}
        </h2>
        <div className="overflow-x-auto rounded-xl border border-slate-700/50">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50 bg-slate-800/30">
                <th className="text-left p-4 font-medium text-slate-400">Feature</th>
                <th className="text-left p-4 font-medium text-slate-400">{competitorName}</th>
                <th className={`text-left p-4 font-medium ${accent.text}`}>KubeStellar Console</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.feature} className={`border-b border-slate-800/50 ${index % 2 === 0 ? 'bg-slate-900/20' : ''}`}>
                  <td className="p-4 font-medium text-slate-200">{row.feature}</td>
                  <td className="p-4">
                    <ComparisonCell value={row.competitor} note={row.competitorNote} />
                  </td>
                  <td className="p-4">
                    <ComparisonCell value={row.console} note={row.consoleNote} highlightStyle={consoleHighlightStyle} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    )
  }

  return (
    <section className="max-w-5xl mx-auto px-6 py-16">
      <h2 className="text-3xl font-bold text-center mb-4">{title}</h2>
      {subtitle && (
        <p className="text-slate-400 text-center mb-12">
          {subtitle}
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-700/50">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-slate-700/50 bg-slate-800/60">
              <th className="px-6 py-4 text-sm font-semibold text-slate-300">Feature</th>
              <th className="px-6 py-4 text-sm font-semibold text-slate-400">
                {competitorSubtitle ? (
                  <span className="inline-flex items-center gap-1.5">
                    {competitorName}
                    <span className="text-xs font-normal text-slate-500">{competitorSubtitle}</span>
                  </span>
                ) : (
                  competitorName
                )}
              </th>
              <th className={`px-6 py-4 text-sm font-semibold ${accent.text}`}>KubeStellar Console</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={row.feature}
                className={`border-b border-slate-700/30 ${index % 2 === 0 ? 'bg-slate-800/20' : 'bg-transparent'}`}
              >
                <td className="px-6 py-3.5 text-sm font-medium text-slate-200">{row.feature}</td>
                <td className="px-6 py-3.5 text-sm">
                  <ComparisonCell value={row.competitor} note={row.competitorNote} />
                </td>
                <td className="px-6 py-3.5 text-sm">
                  <ComparisonCell value={row.console} note={row.consoleNote} highlightStyle={consoleHighlightStyle} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default ComparisonTable
