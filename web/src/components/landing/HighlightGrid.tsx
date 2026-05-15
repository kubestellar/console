import type { ReactNode } from 'react'

import { ACCENT_CLASSES, type AccentColor } from './styles'

export interface HighlightFeature {
  icon: ReactNode
  title: string
  description: string
}

interface HighlightGridProps {
  title: string
  titleAccent: string
  subtitle: string
  highlights: HighlightFeature[]
  accentColor: AccentColor
  variant?: 'standard' | 'holmes'
}

export function HighlightGrid({
  title,
  titleAccent,
  subtitle,
  highlights,
  accentColor,
  variant = 'standard',
}: HighlightGridProps) {
  const accent = ACCENT_CLASSES[accentColor]

  if (variant === 'holmes') {
    return (
      <section className="max-w-5xl mx-auto px-6 py-16">
        <h2 className="text-3xl font-bold text-center mb-4">
          {title}
        </h2>
        <p className="text-slate-400 text-center mb-12">
          {subtitle}
        </p>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {highlights.map(({ icon, title: itemTitle, description }) => (
            <div key={itemTitle} className="p-6 rounded-xl border border-slate-700/50 bg-slate-900/30 hover:bg-slate-900/50 transition-colors">
              <div className="mb-3">{icon}</div>
              <h3 className="font-semibold text-lg mb-2">{itemTitle}</h3>
              <p className="text-sm text-slate-400">{description}</p>
            </div>
          ))}
        </div>
      </section>
    )
  }

  return (
    <section className="max-w-5xl mx-auto px-6 py-16">
      <h2 className="text-3xl font-bold text-center mb-4">
        {title}{' '}
        <span className={accent.text}>{titleAccent}</span>
      </h2>
      <p className="text-slate-400 text-center mb-12 max-w-2xl mx-auto">
        {subtitle}
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {highlights.map(({ icon, title: itemTitle, description }) => (
          <div
            key={itemTitle}
            className={`rounded-xl border border-slate-700/50 bg-slate-800/30 p-6 ${accent.borderHover} hover:bg-slate-800/50 transition-colors`}
          >
            <div className="mb-4">{icon}</div>
            <h3 className="text-lg font-semibold mb-2">{itemTitle}</h3>
            <p className="text-sm text-slate-400 leading-relaxed">{description}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

export default HighlightGrid
