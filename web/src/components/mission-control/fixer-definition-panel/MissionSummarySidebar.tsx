import { Layers } from 'lucide-react'
import type { PayloadProject } from '../types'
import { CategoryIcon } from './fixerDefinitionPanel.constants'
import { getCategoryCounts, getPriorityCounts, getTotalDependencies } from './fixerDefinitionPanel.utils'

interface MissionSummarySidebarProps {
  projects: PayloadProject[]
}

export function MissionSummarySidebar({ projects }: MissionSummarySidebarProps) {
  const categoryCounts = getCategoryCounts(projects)
  const priorityCounts = getPriorityCounts(projects)
  const totalDependencies = getTotalDependencies(projects)

  return (
    <div className="w-56 border-r border-border bg-card p-4 flex flex-col gap-4 overflow-y-auto shrink-0">
      <div>
        <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Mission Summary</h3>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Projects</span>
            <span className="font-semibold text-foreground">{projects.length}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Dependencies</span>
            <span className="font-semibold text-foreground">{totalDependencies}</span>
          </div>
        </div>
      </div>

      {projects.length > 0 ? (
        <>
          <div>
            <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">By Priority</h3>
            <div className="space-y-1.5">
              {priorityCounts.required > 0 && (
                <div className="flex items-center gap-2 text-xs">
                  <div className="w-2 h-2 rounded-full bg-red-400" />
                  <span className="text-muted-foreground flex-1">Required</span>
                  <span className="font-semibold text-foreground">{priorityCounts.required}</span>
                </div>
              )}
              {priorityCounts.recommended > 0 && (
                <div className="flex items-center gap-2 text-xs">
                  <div className="w-2 h-2 rounded-full bg-blue-400" />
                  <span className="text-muted-foreground flex-1">Recommended</span>
                  <span className="font-semibold text-foreground">{priorityCounts.recommended}</span>
                </div>
              )}
              {priorityCounts.optional > 0 && (
                <div className="flex items-center gap-2 text-xs">
                  <div className="w-2 h-2 rounded-full bg-gray-400" />
                  <span className="text-muted-foreground flex-1">Optional</span>
                  <span className="font-semibold text-foreground">{priorityCounts.optional}</span>
                </div>
              )}
            </div>
          </div>

          <div>
            <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">By Category</h3>
            <div className="space-y-1.5">
              {categoryCounts.map(([category, count]) => (
                <div key={category} className="flex items-center gap-2 text-xs">
                  <CategoryIcon category={category} />
                  <span className="text-muted-foreground flex-1 truncate" title={category}>{category}</span>
                  <span className="font-semibold text-foreground">{count}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground/50">
          <Layers className="w-6 h-6 mb-2" />
          <p className="text-[10px] text-center">Describe your fix to get started</p>
        </div>
      )}
    </div>
  )
}
