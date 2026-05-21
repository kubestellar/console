import { Layers } from 'lucide-react'
import { cn } from '../../../lib/cn'
import type { PayloadProject } from '../types'
import { CategoryIcon } from './fixerDefinitionPanel.constants'
import { getCategoryCounts, getPriorityCounts, getTotalDependencies } from './fixerDefinitionPanel.utils'

interface MissionSummarySidebarProps {
  projects: PayloadProject[]
  selectedProjectName?: string
  onSelectProject?: (project: PayloadProject) => void
}

export function MissionSummarySidebar({ projects, selectedProjectName, onSelectProject }: MissionSummarySidebarProps) {
  const safeProjects = projects || []
  const categoryCounts = getCategoryCounts(safeProjects)
  const priorityCounts = getPriorityCounts(safeProjects)
  const totalDependencies = getTotalDependencies(safeProjects)

  return (
    <div className="w-56 border-r border-border bg-card p-4 flex flex-col gap-4 overflow-y-auto shrink-0">
      <div>
        <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Mission Summary</h3>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Projects</span>
            <span className="font-semibold text-foreground">{safeProjects.length}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Dependencies</span>
            <span className="font-semibold text-foreground">{totalDependencies}</span>
          </div>
        </div>
      </div>

      {safeProjects.length > 0 ? (
        <>
          <div>
            <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Projects</h3>
            <div className="space-y-1.5">
              {safeProjects.map((project, index) => {
                const isSelected = project.name === selectedProjectName

                return (
                  <button
                    key={project.name}
                    type="button"
                    onClick={() => onSelectProject?.(project)}
                    className={cn(
                      'flex w-full items-start gap-2 rounded-lg border px-2 py-2 text-left transition-colors',
                      isSelected
                        ? 'border-primary bg-primary/10'
                        : 'border-border bg-background/40 hover:border-primary/30 hover:bg-muted/30',
                    )}
                  >
                    <span className={cn(
                      'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold',
                      isSelected
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-secondary text-muted-foreground',
                    )}>
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-foreground" title={project.displayName}>
                        {project.displayName}
                      </p>
                      <div className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        <CategoryIcon category={project.category} />
                        <span className="truncate">{project.category}</span>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

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
