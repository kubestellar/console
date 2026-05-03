/**
 * PayloadGrid — Animated grid of PayloadCards with search/filter.
 */

import { useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Search, Package } from 'lucide-react'
import type { PayloadProject } from './types'
import { PayloadCard } from './PayloadCard'

interface PayloadGridProps {
  projects: PayloadProject[]
  onRemoveProject: (name: string) => void
  onUpdatePriority: (name: string, priority: PayloadProject['priority']) => void
  onHoverProject?: (project: PayloadProject | null) => void
  onClickProject?: (project: PayloadProject) => void
  installedProjects?: Set<string>
}

export function PayloadGrid({
  projects,
  onRemoveProject,
  onUpdatePriority,
  onHoverProject,
  onClickProject,
  installedProjects }: PayloadGridProps) {
  const [filter, setFilter] = useState('')

  const filtered = (() => {
    if (!filter) return projects
    const q = filter.toLowerCase()
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.displayName.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
    )
  })()

  if (projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <Package className="w-10 h-10 mb-3 opacity-40" />
        <p className="text-sm">No projects selected yet</p>
        <p className="text-xs mt-1">
          Describe your fix and let AI suggest projects, or add them manually
        </p>
      </div>
    )
  }

  return (
    <div>
      {projects.length > 4 && (
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter projects..."
            className="w-full pl-9 pr-3 py-1.5 text-sm rounded-lg border border-border bg-secondary/50 focus:outline-hidden focus:ring-1 focus:ring-primary"
          />
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        <AnimatePresence mode="popLayout">
          {filtered.map((project) => (
            <PayloadCard
              key={project.name}
              project={project}
              onRemove={() => onRemoveProject(project.name)}
              onUpdatePriority={(p) => onUpdatePriority(project.name, p)}
              onHover={onHoverProject}
              onClick={onClickProject ? () => onClickProject(project) : undefined}
              installed={installedProjects?.has(project.name)}
            />
          ))}
        </AnimatePresence>
      </div>
      <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
        <span>{projects.length} project{projects.length !== 1 ? 's' : ''}</span>
        <span>{projects.filter((p) => p.priority === 'required').length} required</span>
        <span>
          {new Set(projects.flatMap((p) => p.dependencies)).size} dependencies
        </span>
      </div>
    </div>
  )
}
