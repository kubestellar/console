import { useMemo } from 'react'
import { Eye } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'
import type { DeployPhase, PayloadProject } from './types'
import { getDependencyNotes, generateDefaultPhases } from './DeployModeInfoPanelUtils'

// ---------------------------------------------------------------------------
// DeployModeInfoPanel
// ---------------------------------------------------------------------------

export function DeployModeInfoPanel({ mode, phases, projects, onShowProject, installedProjects = new Set() }: {
  mode: 'phased' | 'yolo'
  phases: DeployPhase[]
  projects: PayloadProject[]
  onShowProject?: (project: PayloadProject) => void
  installedProjects?: Set<string>
}) {
  const { t } = useTranslation()
  const depNotes = getDependencyNotes(projects)
  const projectByName = useMemo(
    () => new Map(projects.map((project) => [project.name, project] as const)),
    [projects]
  )
  // Use AI-provided phases, or auto-generate from dependencies
  const effectivePhases = phases.length > 0 ? phases : generateDefaultPhases(projects)
  const totalEstSec = effectivePhases.reduce((sum, p) => sum + (p.estimatedSeconds ?? 180), 0)
  const aiMinLow = Math.ceil(totalEstSec / 60)
  const aiMinHigh = Math.ceil(totalEstSec * 1.5 / 60)
  // Human estimate: ~20-40 min per project (reading docs, writing YAML, debugging RBAC, etc.)
  const HUMAN_MIN_LOW_PER_PROJECT = 20
  const HUMAN_MIN_HIGH_PER_PROJECT = 40
  const humanHrsLow = Math.max(1, Math.floor(projects.length * HUMAN_MIN_LOW_PER_PROJECT / 60))
  const humanHrsHigh = Math.ceil(projects.length * HUMAN_MIN_HIGH_PER_PROJECT / 60)

  return (
    <>
      <div>
        <h3 className="text-base font-bold text-foreground">
          {mode === 'phased' ? 'Phased Rollout' : 'YOLO Mode'}
        </h3>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
          {mode === 'phased'
            ? 'Deploy projects in sequential phases. Each phase completes before the next begins. Prerequisites and dependencies are respected — infrastructure first, then services, then monitoring.'
            : "Launch all projects simultaneously across all clusters. No waiting for dependencies. Maximum speed, maximum risk. Best for dev/test environments or when you're feeling lucky."}
        </p>
      </div>

      {/* AI vs Human time comparison */}
      {projects.length > 0 && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
          <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Time Estimate</h4>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs">🤖</span>
                <span className="text-xs font-medium text-foreground">AI-Assisted</span>
              </div>
              <span className="text-sm font-bold text-primary">{aiMinLow}–{aiMinHigh} min</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs">👤</span>
                <span className="text-xs font-medium text-foreground">Manual (Human)</span>
              </div>
              <span className="text-sm font-bold text-muted-foreground">{humanHrsLow}–{humanHrsHigh} hrs</span>
            </div>
            <div className="h-px bg-border" />
            <p className="text-[10px] text-muted-foreground italic">
              {Math.round(humanHrsLow * 60 / aiMinHigh)}x faster — includes reading docs, writing YAML, debugging RBAC, troubleshooting image pulls, and configuring integrations
            </p>
          </div>
        </div>
      )}

      {mode === 'phased' && effectivePhases.length > 0 && (
        <p className="text-xs text-primary">
          {effectivePhases.length} phases · {aiMinLow}–{aiMinHigh} min estimated
        </p>
      )}

      {/* Phase breakdown — different layout for phased vs YOLO */}
      {mode === 'phased' && effectivePhases.length > 0 && (
        <div>
          <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Launch Sequence
          </h4>
          <div className="space-y-3">
            {effectivePhases.map((phase, phaseIdx) => {
              const phaseProjects = phase.projectNames
                .map((projectName) => projectByName.get(projectName))
                .filter((project): project is PayloadProject => Boolean(project))
              return (
                <div key={phase.phase} className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-bold text-white bg-primary rounded-full w-6 h-6 flex items-center justify-center shadow-xs">
                      {phase.phase}
                    </span>
                    <span className="text-sm font-semibold text-foreground">{phase.name}</span>
                    {phase.estimatedSeconds && (
                      <span className="text-[10px] text-muted-foreground ml-auto">
                        {Math.ceil(phase.estimatedSeconds / 60)}–{Math.ceil(phase.estimatedSeconds * 1.5 / 60)} min
                      </span>
                    )}
                  </div>
                  <ul className="space-y-2 ml-1">
                    {phaseProjects.map((proj, projectIdx) => (
                      <li key={proj.name} className="flex items-start gap-2">
                        <span className="text-xs font-bold text-primary mt-0.5 shrink-0">{phaseIdx + 1}.{projectIdx + 1}</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-medium text-foreground">{proj.displayName}</span>
                            {onShowProject && (
                              <button
                                onClick={() => onShowProject(proj)}
                                className="p-0.5 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                                title="View install mission"
                              >
                                <Eye className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                          {installedProjects.has(proj.name) && (
                            <span className="text-[9px] ml-1 px-1 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                              installed
                            </span>
                          )}
                          {!installedProjects.has(proj.name) && (
                            <span className="text-[9px] ml-1 px-1 py-0.5 rounded bg-slate-500/10 text-muted-foreground">
                              deploy
                            </span>
                          )}
                          <span className={cn(
                            'text-[9px] ml-1.5 px-1 py-0.5 rounded',
                            proj.priority === 'required' ? 'bg-red-500/10 text-red-600 dark:text-red-400' :
                            proj.priority === 'recommended' ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400' :
                            'bg-gray-500/10 text-gray-500 dark:text-gray-400'
                          )}>
                            {proj.priority}
                          </span>
                          {proj.reason && (
                            <p className="text-[10px] text-muted-foreground mt-0.5">{proj.reason}</p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                  {phaseIdx < effectivePhases.length - 1 && (
                    <div className="flex items-center justify-center mt-2 text-muted-foreground">
                      <span className="text-[10px]">↓ wait for completion ↓</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {mode === 'yolo' && projects.length > 0 && (
        <div>
          <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            All Launched Simultaneously
          </h4>
          <div className="rounded-lg border border-purple-500/20 bg-purple-500/5 p-3">
            <div className="flex flex-wrap gap-1.5">
              {projects.map((proj) => (
                <span key={proj.name} className={cn(
                  'text-[10px] px-2 py-1 rounded-md border',
                  installedProjects.has(proj.name)
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border-emerald-500/20'
                    : 'bg-purple-500/10 text-purple-600 dark:text-purple-300 border-purple-500/20'
                )}>
                  {proj.displayName}
                  {installedProjects.has(proj.name) && <span className="ml-1 opacity-60">✓</span>}
                </span>
              ))}
            </div>
            <p className="text-[10px] text-purple-600 dark:text-purple-400 opacity-60 mt-2 italic">
              No ordering — all {projects.length} projects deploy at once
            </p>
          </div>
        </div>
      )}

      {/* Dependency integration notes */}
      {depNotes.length > 0 && (
        <div>
          <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Integration & Dependency Notes
          </h4>
          <ul className="space-y-1.5">
            {depNotes.map((note, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-foreground/80">
                <span className="text-primary mt-0.5 shrink-0">→</span>
                <span>{note}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="pt-2 border-t border-border">
        <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
          {mode === 'phased' ? t('missionControl.blueprintInfo.phasedSafetyFeatures') : t('missionControl.blueprintInfo.parallelConsiderations')}
        </h4>
        <div className="text-xs text-muted-foreground">
          {mode === 'phased' ? (
            <ul className="space-y-1 list-disc list-inside">
              <li>{t('missionControl.blueprintInfo.safeForProduction')}</li>
              <li>{t('missionControl.blueprintInfo.automaticPauseOnFailure')}</li>
              <li>{t('missionControl.blueprintInfo.retrySkipIndividual')}</li>
              <li>{t('missionControl.blueprintInfo.dependenciesValidatedPerPhase')}</li>
              <li>{t('missionControl.blueprintInfo.rollbackPlanGenerated')}</li>
            </ul>
          ) : (
            <ul className="space-y-1 list-disc list-inside">
              <li>{t('missionControl.blueprintInfo.allMissionsParallel')}</li>
              <li>{t('missionControl.blueprintInfo.noDependencyGating')}</li>
              <li>{t('missionControl.blueprintInfo.fastestDeployment')}</li>
              <li>{t('missionControl.blueprintInfo.failuresDontBlock')}</li>
              <li>{t('missionControl.blueprintInfo.manualInterventionNeeded')}</li>
            </ul>
          )}
        </div>
      </div>

      {/* Rollback Plan */}
      {projects.length > 0 && (() => {
        const toRemove = projects.filter(p => !installedProjects.has(p.name))
        const toKeep = projects.filter(p => installedProjects.has(p.name))
        const effectivePhases2 = phases.length > 0 ? phases : generateDefaultPhases(projects)
        const rollbackPhases = [...effectivePhases2].reverse()
        return (
          <div className="pt-2 border-t border-border">
            <h4 className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-1.5">
              Rollback Plan
            </h4>
            <p className="text-[10px] text-muted-foreground mb-2">
              Reverse deployment in safe order. Already-installed items are preserved.
            </p>

            {toKeep.length > 0 && (
              <div className="mb-2">
                <p className="text-[9px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-1">
                  Protected (will not be removed)
                </p>
                <div className="flex flex-wrap gap-1">
                  {toKeep.map(p => (
                    <span key={p.name} className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    </span>
                  ))}
                </div>
              </div>
            )}

            {toRemove.length > 0 && (
              <div>
                <p className="text-[9px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-1">
                  {mode === 'phased' ? 'Removal Order (reverse phases)' : 'Will Be Removed'}
                </p>
                {mode === 'phased' ? (
                  <div className="space-y-1.5">
                    {rollbackPhases.map((phase, i) => {
                      const removable = phase.projectNames.filter(n => !installedProjects.has(n))
                      if (removable.length === 0) return null
                      return (
                        <div key={phase.phase} className="rounded border border-amber-500/20 bg-amber-500/5 p-2">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="text-[9px] font-bold text-amber-600 dark:text-amber-400">Step {i + 1}</span>
                            <span className="text-[10px] text-muted-foreground">Remove {phase.name}</span>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {removable.map(n => (
                              <span key={n} className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20">
                                helm uninstall {n}
                              </span>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {toRemove.map(p => (
                      <span key={p.name} className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20">
                        helm uninstall {p.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {toRemove.length === 0 && (
              <p className="text-[10px] text-emerald-600 dark:text-emerald-400 italic">
                All projects are already installed — nothing to roll back.
              </p>
            )}
          </div>
        )
      })()}
    </>
  )
}
