/**
 * AssignmentMatrix — Grid of cluster columns × project rows.
 * Click cells to assign/unassign. AI-recommended cells glow purple.
 */

import { cn } from '../../lib/cn'
import { Check } from 'lucide-react'
import { Button } from '../ui/Button'
import type { ClusterInfo } from '../../hooks/mcp/types'
import type { PayloadProject, ClusterAssignment } from './types'

type ProjectStatus = 'installed' | 'warning' | 'error' | 'missing' | 'unknown'

/** Parse AI warnings to determine per-project status on a cluster */
function getProjectStatus(warnings: string[], projectName: string): ProjectStatus {
  const lower = projectName.toLowerCase()
  for (const w of warnings) {
    const wl = w.toLowerCase()
    // Check if this warning mentions this project
    if (!wl.includes(lower) && !wl.includes(lower.replace(/-/g, ' '))) continue
    if (/already running|already deployed|already installed|healthy|skip install/.test(wl)) return 'installed'
    if (/not installed|missing|must install/.test(wl)) return 'missing'
    if (/conflict|error|fail|crash/.test(wl)) return 'error'
    if (/warning|may|compatibility|test first/.test(wl)) return 'warning'
  }
  return 'unknown'
}

const STATUS_DOT: Record<ProjectStatus, { color: string; title: string } | null> = {
  installed: { color: 'bg-emerald-400', title: 'Already installed & running' },
  warning: { color: 'bg-amber-400', title: 'Warning — may need attention' },
  error: { color: 'bg-red-400', title: 'Error or conflict detected' },
  missing: { color: 'bg-slate-500', title: 'Not installed' },
  unknown: null,
}

interface AssignmentMatrixProps {
  projects: PayloadProject[]
  clusters: ClusterInfo[]
  assignments: ClusterAssignment[]
  onToggle: (clusterName: string, projectName: string, assigned: boolean) => void
}

export function AssignmentMatrix({
  projects,
  clusters,
  assignments,
  onToggle,
}: AssignmentMatrixProps) {
  const getAssignment = (clusterName: string) =>
    assignments.find((a) => a.clusterName === clusterName)

  const isAssigned = (clusterName: string, projectName: string) =>
    getAssignment(clusterName)?.projectNames.includes(projectName) ?? false

  if (clusters.length === 0 || projects.length === 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-8">
        No clusters or projects to display
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr>
            <th className="text-left p-2 font-medium text-muted-foreground border-b border-border sticky left-0 bg-background z-10">
              Project
            </th>
            {clusters.map((c) => (
              <th
                key={c.name}
                className="p-2 font-medium text-muted-foreground border-b border-border text-center min-w-[80px]"
              >
                <div className="truncate max-w-[100px]" title={c.name}>
                  {c.name}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {projects.map((project) => (
            <tr key={project.name} className="hover:bg-secondary/30 transition-colors">
              <td className="p-2 border-b border-border/50 sticky left-0 bg-background z-10">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{project.displayName}</span>
                  {project.priority === 'required' && (
                    <span className="text-[9px] px-1 py-0.5 rounded bg-red-500/15 text-red-400">
                      req
                    </span>
                  )}
                </div>
              </td>
              {clusters.map((cluster) => {
                const assigned = isAssigned(cluster.name, project.name)
                const assignment = getAssignment(cluster.name)
                const status = assignment ? getProjectStatus(assignment.warnings, project.name) : 'unknown'
                const dot = STATUS_DOT[status]
                return (
                  <td
                    key={cluster.name}
                    className="p-2 border-b border-border/50 text-center"
                  >
                    {/*
                      Reserve space for the status dot in every cell so
                      checkbox columns line up vertically regardless of
                      whether a particular row has a dot. Without the
                      placeholder span, rows with no dot let the checkbox
                      drift to the cell center, misaligning columns.
                    */}
                    <div className="flex items-center justify-center gap-1.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onToggle(cluster.name, project.name, !assigned)}
                        className={cn(
                          'w-7! h-7! p-0! rounded-lg border',
                          assigned
                            ? 'bg-primary/20 border-primary/50 text-primary hover:bg-primary/30'
                            : 'border-border hover:border-primary/30 hover:bg-primary/5 text-transparent hover:text-primary/30'
                        )}
                        title={assigned ? 'Unassign project' : 'Assign project'}
                        icon={<Check className="w-3.5 h-3.5" />}
                      />
                      <span
                        className={cn(
                          'w-2 h-2 rounded-full shrink-0',
                          dot ? dot.color : 'bg-transparent'
                        )}
                        title={dot?.title}
                        aria-hidden={dot ? undefined : true}
                      />
                    </div>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {/*
        Status legend matches the dot palette in STATUS_DOT. Mirrors the
        Flight Plan's legend pattern so users learn the colors once.
      */}
      <div className="mt-3 pt-3 border-t border-border/50 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
        <span className="font-medium uppercase tracking-wider text-[10px]">Status:</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-400" /> Already installed</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400" /> Warning</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-400" /> Error / conflict</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-slate-500" /> Not installed</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full border border-border/60" /> No data</span>
      </div>
    </div>
  )
}
