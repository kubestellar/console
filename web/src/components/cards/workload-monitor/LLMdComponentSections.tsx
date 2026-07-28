// Hierarchical component list for the llm-d stack monitor card.
// Extracted from LLMdStackMonitor.tsx (issue #21614) — markup unchanged.
import { ChevronDown, ChevronRight, type LucideIcon } from 'lucide-react'
import { cn } from '../../../lib/cn'
import { StatusBadge } from '../../ui/StatusBadge'
import { CardAIActions } from '../../../lib/cards/CardComponents'
import { STATUS_DOT, type ComponentItem } from './LLMdStackMonitor.constants'

export interface LLMdSection {
  label: string
  icon: LucideIcon
  color: string
  items: ComponentItem[]
}

interface LLMdComponentSectionsProps {
  sections: LLMdSection[]
  expandedSections: Set<string>
  onToggleSection: (label: string) => void
  onDiagnoseItem: (item: ComponentItem) => void
}

export function LLMdComponentSections({
  sections,
  expandedSections,
  onToggleSection,
  onDiagnoseItem,
}: LLMdComponentSectionsProps) {
  return (
    <div className="flex-1 overflow-y-auto space-y-0.5">
      {sections.map(section => {
        const SectionIcon = section.icon
        const isExpanded = expandedSections.has(section.label)
        const sectionHealthy = section.items.filter(i => i.status === 'healthy').length
        const allHealthy = sectionHealthy === section.items.length

        return (
          <div key={section.label} className="border-b border-border/30 last:border-0">
            <button
              onClick={() => onToggleSection(section.label)}
              className="w-full flex items-center gap-2 py-1.5 px-1 text-left hover:bg-card/30 rounded transition-colors"
            >
              {isExpanded
                ? <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
                : <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />}
              <SectionIcon className={cn('w-3.5 h-3.5 shrink-0', section.color)} />
              <span className="text-sm text-foreground flex-1">{section.label}</span>
              <span
                className={cn(
                  'text-xs px-1.5 py-0.5 rounded cursor-default',
                  allHealthy ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400',
                )}
                title={`${sectionHealthy} healthy out of ${section.items.length} total ${section.label} components`}
              >
                {sectionHealthy}/{section.items.length}
              </span>
            </button>
            {isExpanded && (
              <div className="ml-8 mb-1.5 space-y-0.5">
                {section.items.map((item, idx) => (
                  <div key={`${section.label}-${idx}-${item.name}`} className="flex items-center gap-2 py-0.5 px-1 rounded hover:bg-card/30 transition-colors group">
                    <div className={cn('w-1.5 h-1.5 rounded-full shrink-0', STATUS_DOT[item.status] || 'bg-gray-400')} />
                    <span className="text-xs text-foreground truncate flex-1">{item.name}</span>
                    {item.namespace && (
                      <StatusBadge color="purple" size="xs" className="shrink-0">
                        {item.namespace}
                      </StatusBadge>
                    )}
                    {item.detail && (
                      <span className="text-2xs text-muted-foreground shrink-0 truncate max-w-[150px]">
                        {item.detail}
                      </span>
                    )}
                    {item.cluster && (
                      <span className="text-2xs px-1 py-0.5 rounded bg-secondary text-muted-foreground shrink-0">
                        {item.cluster}
                      </span>
                    )}
                    {/* Diag icon - show for non-healthy items */}
                    {item.status !== 'healthy' && (
                      <CardAIActions
                        resource={{ kind: 'Deployment', name: item.name, namespace: item.namespace, cluster: item.cluster, status: item.status }}
                        issues={item.detail ? [{ name: item.status, message: item.detail }] : []}
                        showRepair={false}
                        onDiagnose={(e) => { e.stopPropagation(); onDiagnoseItem(item) }}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
