import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import type { MissionExport } from '../../../lib/missions/types'
import { fetchMissionContent } from '../../../lib/missions/missionCache'
import type { PayloadProject } from '../types'
import { cn } from '../../../lib/cn'
import { ALTERNATIVES, ALTERNATIVES_DISPLAY, type ProjectAlternative } from './fixerDefinitionPanel.constants'

interface AlternativeOption extends ProjectAlternative {
  existingProject?: PayloadProject
  isCurrent: boolean
  isOriginal: boolean
}

interface ProjectDetailPanelProps {
  project: PayloadProject
  allProjects: PayloadProject[]
  onAddAlternative?: (project: PayloadProject) => void
  onReplace?: (oldName: string, newProject: PayloadProject) => void
  onSelectAlternative?: (project: PayloadProject) => void
}

export function ProjectDetailPanel({ project, allProjects, onAddAlternative, onReplace, onSelectAlternative }: ProjectDetailPanelProps) {
  const [mission, setMission] = useState<MissionExport | null>(null)
  const [loadingSteps, setLoadingSteps] = useState(false)
  const fetchedRef = useRef('')

  useEffect(() => {
    if (!project.kbPath || fetchedRef.current === project.kbPath) {
      return
    }

    fetchedRef.current = project.kbPath
    const controller = new AbortController()
    const indexMission: MissionExport = {
      version: 'kc-mission-v1',
      title: project.displayName,
      description: project.reason ?? '',
      type: 'custom',
      tags: [],
      steps: [],
      metadata: { source: project.kbPath },
    }

    setLoadingSteps(true)
    fetchMissionContent(indexMission)
      .then(({ mission: nextMission }) => {
        if (!controller.signal.aborted) {
          setMission(nextMission)
        }
      })
      .catch((error) => {
        if (error?.name !== 'AbortError' && !controller.signal.aborted) {
          setMission(null)
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoadingSteps(false)
        }
      })

    return () => controller.abort()
  }, [project.displayName, project.kbPath, project.reason])

  const availableAlternatives = buildAvailableAlternatives(project, allProjects)
  const isSwapped = Boolean(project.originalName)

  return (
    <>
      <div>
        <h3 className="text-base font-bold text-foreground">{project.displayName}</h3>
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
            {project.category}
          </span>
          {project.maturity && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-medium">
              {project.maturity}
            </span>
          )}
          <span className={cn(
            'text-[10px] px-1.5 py-0.5 rounded-full font-medium',
            project.priority === 'required'
              ? 'bg-red-500/10 text-red-400'
              : project.priority === 'recommended'
                ? 'bg-blue-500/10 text-blue-400'
                : 'bg-gray-500/10 text-gray-400 dark:text-gray-500',
          )}>
            {project.priority}
          </span>
          {project.importedMission && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/10 text-purple-400 font-medium">
              {project.replacesInstallMission ? 'your YAML' : 'your YAML + community'}
            </span>
          )}
        </div>
      </div>

      {project.reason && (
        <div>
          <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Why AI Chose This</h4>
          <p className="text-sm text-foreground/80 leading-relaxed">{project.reason}</p>
        </div>
      )}

      {project.dependencies.length > 0 && (
        <div>
          <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Dependencies</h4>
          <div className="flex flex-wrap gap-1">
            {project.dependencies.map((dependency) => (
              <span key={dependency} className="text-xs px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-400 border border-purple-500/20">
                {dependency}
              </span>
            ))}
          </div>
        </div>
      )}

      {project.kbPath && (
        <div>
          <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Install Steps</h4>
          {loadingSteps ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
              <Loader2 className="w-3 h-3 animate-spin" />
              Loading mission...
            </div>
          ) : mission?.steps && mission.steps.length > 0 ? (
            <div className="space-y-2">
              {mission.steps.map((step, index) => (
                <div key={index} className="flex gap-2">
                  <span className="text-[10px] font-bold text-primary mt-0.5 shrink-0">{index + 1}.</span>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground">{step.title || step.description?.slice(0, 80)}</p>
                    {step.command && (
                      <pre className="text-[10px] text-emerald-400 font-mono mt-0.5 bg-slate-800 rounded px-1.5 py-0.5 overflow-x-auto whitespace-pre-wrap break-all">
                        {step.command}
                      </pre>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-emerald-400 font-mono">
              {project.kbPath.split('/').pop()?.replace('.json', '')}
            </p>
          )}
        </div>
      )}

      {availableAlternatives.length > 0 && (
        <div>
          <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Alternatives
            {isSwapped && <span className="text-amber-400 normal-case font-normal ml-1">(swapped from original)</span>}
          </h4>
          <div className="space-y-2">
            {availableAlternatives.map((alternative) => {
              const alternativeProject = buildAlternativeProject(project, alternative)
              const canSelectAlternative = !alternative.isCurrent && Boolean(alternative.existingProject && onSelectAlternative)
              const canAddAlternative = !alternative.isCurrent && !alternative.existingProject && Boolean(onAddAlternative)
              const canSwapAlternative = !alternative.isCurrent && !alternative.existingProject && Boolean(onReplace)
              const isRowClickable = canAddAlternative || canSelectAlternative
              const actionLabel = canSelectAlternative
                ? `View ${alternative.displayName} details`
                : `Add ${alternative.displayName} to mission`
              const handleAlternativeClick = () => {
                if (alternative.existingProject) {
                  onSelectAlternative?.(alternative.existingProject)
                  return
                }

                onAddAlternative?.(alternativeProject)
              }

              return (
                <div
                  key={alternative.name}
                  className={cn(
                    'rounded-lg border p-2.5 transition-colors',
                    alternative.isCurrent
                      ? 'border-primary/40 bg-primary/5'
                      : 'border-border hover:border-primary/40 hover:bg-primary/5',
                    isRowClickable && 'cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-primary/50',
                  )}
                  role={isRowClickable ? 'button' : undefined}
                  tabIndex={isRowClickable ? 0 : undefined}
                  onClick={isRowClickable ? handleAlternativeClick : undefined}
                  onKeyDown={isRowClickable ? (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      handleAlternativeClick()
                    }
                  } : undefined}
                  aria-label={isRowClickable ? actionLabel : undefined}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <AlternativeSummary alternative={alternative} />
                    </div>
                    {alternative.isCurrent ? (
                      <span className="shrink-0 text-[10px] px-2 py-0.5 rounded bg-primary/10 text-primary">
                        Current
                      </span>
                    ) : (
                      <div className="flex shrink-0 items-center gap-1">
                        {canAddAlternative && (
                          <span className="text-[10px] px-2 py-0.5 rounded bg-primary/10 text-primary">
                            Add
                          </span>
                        )}
                        {canSelectAlternative && (
                          <span className="text-[10px] px-2 py-0.5 rounded bg-secondary text-foreground">
                            View
                          </span>
                        )}
                        {canSwapAlternative && (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              onReplace?.(project.name, alternativeProject)
                            }}
                            className="text-[10px] px-2 py-0.5 rounded bg-secondary text-foreground hover:bg-secondary/80 transition-colors"
                          >
                            Swap
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </>
  )
}

function AlternativeSummary({ alternative }: { alternative: AlternativeOption }) {
  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-medium text-foreground">{alternative.displayName}</span>
        {alternative.isCurrent && (
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/20 text-primary font-medium">
            Selected
          </span>
        )}
        {alternative.isOriginal && (
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-medium">
            AI Original
          </span>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground mt-0.5">{alternative.reason}</p>
    </>
  )
}

function buildAlternativeProject(project: PayloadProject, alternative: AlternativeOption): PayloadProject {
  return {
    name: alternative.name,
    displayName: alternative.displayName,
    reason: alternative.reason,
    category: project.category,
    priority: project.priority,
    dependencies: project.dependencies,
  }
}

function buildAvailableAlternatives(project: PayloadProject, allProjects: PayloadProject[]): AlternativeOption[] {
  const lookupKey = project.originalName ?? project.name
  const alternatives = ALTERNATIVES[lookupKey] ?? []
  const allAlternatives: AlternativeOption[] = []

  if (project.originalName) {
    allAlternatives.push({
      name: lookupKey,
      displayName: ALTERNATIVES_DISPLAY[lookupKey]?.displayName ?? lookupKey,
      reason: ALTERNATIVES_DISPLAY[lookupKey]?.reason ?? 'Original AI recommendation',
      existingProject: findAlternativeProject(allProjects, lookupKey, project.name),
      isCurrent: false,
      isOriginal: true,
    })
  }

  for (const alternative of alternatives) {
    if (alternative.name.toLowerCase().trim() === project.name.toLowerCase().trim()) {
      continue
    }

    allAlternatives.push({
      ...alternative,
      existingProject: findAlternativeProject(allProjects, alternative.name, project.name),
      isCurrent: alternative.name === project.name,
      isOriginal: false,
    })
  }

  if (!allAlternatives.some((alternative) => alternative.name === project.name)) {
    allAlternatives.unshift({
      name: project.name,
      displayName: project.displayName,
      reason: project.reason ?? '',
      isCurrent: true,
      isOriginal: false,
    })
  }

  return allAlternatives
}

function findAlternativeProject(allProjects: PayloadProject[], alternativeName: string, currentProjectName: string): PayloadProject | undefined {
  const normalizedAlternativeName = alternativeName.toLowerCase().trim()
  const normalizedCurrentProjectName = currentProjectName.toLowerCase().trim()

  return allProjects.find((candidate) => {
    const normalizedCandidateName = candidate.name.toLowerCase().trim()
    return normalizedCandidateName === normalizedAlternativeName && normalizedCandidateName !== normalizedCurrentProjectName
  })
}
