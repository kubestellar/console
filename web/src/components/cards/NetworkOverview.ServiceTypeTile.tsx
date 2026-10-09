import type { LucideIcon } from 'lucide-react'

interface ServiceTypeTileProps {
  serviceType: string
  count: number
  icon: LucideIcon
  /** Background + border classes for the tile */
  tileClass: string
  /** Hover background class applied when the tile is clickable */
  hoverClass: string
  /** Text color class for the icon and label */
  textClass: string
  onDrill: (serviceType: string) => void
}

/** Clickable tile summarizing the number of services of one Kubernetes service type. */
export function ServiceTypeTile({
  serviceType,
  count,
  icon: Icon,
  tileClass,
  hoverClass,
  textClass,
  onDrill,
}: ServiceTypeTileProps) {
  const isClickable = count > 0
  return (
    <div
      className={`p-2 rounded-lg ${tileClass} ${isClickable ? `cursor-pointer ${hoverClass} focus:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-400` : 'cursor-default'} transition-colors`}
      {...(isClickable ? { role: 'button' as const, tabIndex: 0 } : {})}
      onClick={() => {
        if (isClickable) {
          onDrill(serviceType)
        }
      }}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && isClickable) {
          e.preventDefault()
          onDrill(serviceType)
        }
      }}
      title={isClickable ? `${count} ${serviceType} service${count !== 1 ? 's' : ''} - Click to view all` : `No ${serviceType} services`}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className={`w-3 h-3 ${textClass}`} />
        <span className={`text-xs ${textClass}`}>{serviceType}</span>
      </div>
      <span className="text-lg font-bold text-foreground">{count}</span>
    </div>
  )
}
