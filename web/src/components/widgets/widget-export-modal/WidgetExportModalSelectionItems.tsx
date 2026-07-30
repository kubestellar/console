import { Check, Monitor } from 'lucide-react'
import {
  type WidgetCardDefinition,
  type WidgetStatDefinition,
  type WidgetTemplateDefinition,
} from '../../../lib/widgets/widgetRegistry'

// Template card component
export function TemplateCard({
  template,
  selected,
  onSelect }: {
  template: WidgetTemplateDefinition
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      onClick={onSelect}
      aria-pressed={selected}
      className={`w-full text-left p-3 rounded-lg border transition-colors ${
        selected
          ? 'bg-purple-500/20 border-purple-500/50'
          : 'bg-secondary/50 border-border hover:border-purple-500/30'
      }`}
    >
      <div className="flex items-center gap-2 mb-1">
        <Monitor className="w-4 h-4 text-purple-400" />
        <span className="font-medium text-sm">{template.displayName}</span>
      </div>
      <p className="text-xs text-muted-foreground mb-2">{template.description}</p>
      <div className="flex flex-wrap gap-1">
        {template.cards.map((c) => (
          <span key={c} className="px-1.5 py-0.5 bg-purple-500/20 text-purple-300 text-2xs rounded">
            {c.replace(/_/g, ' ')}
          </span>
        ))}
        {template.stats?.map((s) => (
          <span key={s} className="px-1.5 py-0.5 bg-blue-500/20 text-blue-300 text-2xs rounded">
            {s.replace(/_/g, ' ')}
          </span>
        ))}
      </div>
      <div className="mt-2 text-2xs text-muted-foreground">
        {template.size.width}×{template.size.height}px • {template.layout} layout
      </div>
    </button>
  )
}

// Card item component
export function CardItem({
  card,
  selected,
  onSelect }: {
  card: WidgetCardDefinition
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      data-widget-card={card.cardType}
      onClick={onSelect}
      aria-pressed={selected}
      className={`w-full text-left p-3 rounded-lg border transition-colors ${
        selected
          ? 'bg-purple-500/20 border-purple-500/50'
          : 'bg-secondary/50 border-border hover:border-purple-500/30'
      }`}
    >
      <div className="font-medium text-sm">{card.displayName}</div>
      <p className="text-xs text-muted-foreground">{card.description}</p>
      <div className="mt-1 text-2xs text-muted-foreground">
        {card.defaultSize.width}×{card.defaultSize.height}px • {card.category}
      </div>
    </button>
  )
}

// Stat item component
export function StatItem({
  stat,
  selected,
  onToggle }: {
  stat: WidgetStatDefinition
  selected: boolean
  onToggle: () => void
}) {
  return (
    <button
      onClick={onToggle}
      aria-pressed={selected}
      className={`w-full text-left p-2 rounded-lg border transition-colors flex items-center gap-3 ${
        selected
          ? 'bg-purple-500/20 border-purple-500/50'
          : 'bg-secondary/50 border-border hover:border-purple-500/30'
      }`}
    >
      <div
        className="w-8 h-8 rounded flex items-center justify-center text-lg font-bold"
        style={{ backgroundColor: `${stat.color}20`, color: stat.color }}
      >
        #
      </div>
      <div>
        <div className="font-medium text-sm">{stat.displayName}</div>
        <div className="text-2xs text-muted-foreground">
          {stat.format} • {stat.size.width}×{stat.size.height}px
        </div>
      </div>
      <div
        className={`ml-auto w-5 h-5 rounded border-2 flex items-center justify-center ${
          selected ? 'bg-purple-500 border-purple-500' : 'border-muted-foreground'
        }`}
      >
        {selected && <Check className="w-3 h-3 text-white" />}
      </div>
    </button>
  )
}
