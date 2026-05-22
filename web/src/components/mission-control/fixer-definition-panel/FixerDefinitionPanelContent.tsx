/**
FixerDefinitionPanel  * Phase 1 of Mission Control. 
 *
 * Left: summary sidebar.
 * Center: mission definition form.
 * Right: project details for the selected payload item.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Info } from 'lucide-react'
import { fetchKubaraCatalog } from '../../../lib/kubara'
import type { Mission } from '../../../hooks/useMissions'
import { getAssistantContentSinceLastUser } from '../useMissionControl'
import type { MissionControlState, PayloadProject } from '../types'
import {
  buildStaticManualWorkloadOptions,
  findManualWorkloadOption,
  humanizeWorkloadName,
  MANUAL_WORKLOAD_SUGGESTION_LIMIT,
  matchesManualWorkloadQuery,
  mergeManualWorkloadOptions,
  type ManualWorkloadOption,
  PLACEHOLDER_EXAMPLES,
} from './fixerDefinitionPanel.constants'
import { MissionSummarySidebar } from './MissionSummarySidebar'
import { FixerDefinitionForm } from './FixerDefinitionForm'
import { ProjectDetailPanel } from './ProjectDetailPanel'

interface FixerDefinitionPanelProps {
  state: MissionControlState
  onDescriptionChange: (desc: string) => void
  onTitleChange: (title: string) => void
  onTargetClustersChange: (clusters: string[]) => void
  onAskAI: (description: string, existing?: PayloadProject[]) => void | Promise<void>
  onAddProject: (project: PayloadProject) => void
  onRemoveProject: (name: string) => void
  onUpdatePriority: (name: string, priority: PayloadProject['priority']) => void
  onReplaceProject?: (oldName: string, newProject: PayloadProject) => void
  aiStreaming: boolean
  planningMission: Mission | null | undefined
  installedProjects?: Set<string>
}

const MANUAL_PLACEHOLDER_INTERVAL_MS = 4000
const MANUAL_WORKLOAD_REASON_FALLBACK = 'Available workload from the Mission Control catalog'

function buildProjectFromManualOption(option: ManualWorkloadOption): PayloadProject {
  return {
    name: option.name,
    displayName: option.displayName,
    reason: option.reason || MANUAL_WORKLOAD_REASON_FALLBACK,
    category: option.category,
    priority: option.priority,
    dependencies: option.dependencies,
    kubaraChart: option.kubaraChart,
  }
}

export function FixerDefinitionPanel({
  state,
  onDescriptionChange,
  onTitleChange,
  onTargetClustersChange,
  onAskAI,
  onAddProject,
  onRemoveProject,
  onUpdatePriority,
  onReplaceProject,
  aiStreaming,
  planningMission,
  installedProjects,
}: FixerDefinitionPanelProps) {
  const [placeholderIdx, setPlaceholderIdx] = useState(0)
  const [showManualAdd, setShowManualAdd] = useState(false)
  const [manualName, setManualName] = useState('')
  const [stickyProject, setStickyProject] = useState<PayloadProject | null>(null)
  const [manualWorkloads, setManualWorkloads] = useState<ManualWorkloadOption[]>(() => buildStaticManualWorkloadOptions())
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const projects = state.projects || []

  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderIdx((value) => (value + 1) % PLACEHOLDER_EXAMPLES.length)
    }, MANUAL_PLACEHOLDER_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    let cancelled = false

    fetchKubaraCatalog()
      .then((catalog) => {
        if (cancelled || (catalog || []).length === 0) return
        const kubaraOptions: ManualWorkloadOption[] = (catalog || []).map((chart) => ({
          name: chart.name,
          displayName: humanizeWorkloadName(chart.name),
          reason: chart.description || MANUAL_WORKLOAD_REASON_FALLBACK,
          category: 'Helm Chart',
          priority: 'recommended',
          dependencies: [],
          kubaraChart: { repoPath: `helm/${chart.name}` },
        }))
        setManualWorkloads((previous) => mergeManualWorkloadOptions(previous, kubaraOptions))
      })
      .catch(() => {
        // Static suggestions already cover the manual-add fallback.
      })

    return () => {
      cancelled = true
    }
  }, [])

  const latestAIContent = getAssistantContentSinceLastUser(planningMission?.messages)
  const planningFailed = planningMission?.status === 'failed'
  const latestSystemError = planningFailed
    ? planningMission?.messages.filter((message) => message.role === 'system').slice(-1)[0]?.content ?? ''
    : ''

  useEffect(() => {
    if (projects.length === 0) {
      setStickyProject(null)
      return
    }

    const hasSelectedProject = projects.some((project) => project.name === stickyProject?.name)
    if (!hasSelectedProject) {
      setStickyProject(projects[0])
    }
  }, [projects, stickyProject?.name])

  const selectedProjectNames = useMemo(
    () => new Set(projects.map((project) => project.name.toLowerCase())),
    [projects],
  )

  const availableManualWorkloads = useMemo(
    () => manualWorkloads.filter((option) => !selectedProjectNames.has(option.name.toLowerCase())),
    [manualWorkloads, selectedProjectNames],
  )

  const manualSuggestions = useMemo(() => {
    return availableManualWorkloads
      .filter((option) => matchesManualWorkloadQuery(option, manualName))
      .slice(0, MANUAL_WORKLOAD_SUGGESTION_LIMIT)
  }, [availableManualWorkloads, manualName])

  const exactManualOption = useMemo(
    () => findManualWorkloadOption(availableManualWorkloads, manualName),
    [availableManualWorkloads, manualName],
  )

  const duplicateManualOption = useMemo(
    () => findManualWorkloadOption(manualWorkloads, manualName),
    [manualName, manualWorkloads],
  )

  const nextManualOption = manualName.trim()
    ? exactManualOption ?? manualSuggestions[0] ?? null
    : null

  const manualHelperText = useMemo(() => {
    const trimmedName = manualName.trim()
    if (!trimmedName) {
      return 'Search workloads by name. Suggestions update as you type.'
    }
    if (duplicateManualOption && selectedProjectNames.has(duplicateManualOption.name.toLowerCase())) {
      return `${duplicateManualOption.displayName} is already selected.`
    }
    if (manualSuggestions.length === 0) {
      return 'No matching workloads found. Only workloads from the suggestion list can be added.'
    }
    if (!exactManualOption) {
      return 'Choose a suggestion or press Enter to add the top match.'
    }
    return 'Ready to add this workload.'
  }, [duplicateManualOption, exactManualOption, manualName, manualSuggestions.length, selectedProjectNames])

  const handleSubmit = () => {
    if (!state.title && state.description.trim()) {
      const firstSentence = state.description.split(/[.!?\n]/)[0].trim()
      onTitleChange(firstSentence.slice(0, 60))
    }

    onAskAI(state.description, state.projects)
  }

  const handleManualAdd = (option?: ManualWorkloadOption) => {
    const nextOption = option ?? nextManualOption
    if (!nextOption) {
      return
    }

    onAddProject(buildProjectFromManualOption(nextOption))
    setManualName('')
    setShowManualAdd(false)
  }

  return (
    <div className="h-full flex">
      <MissionSummarySidebar
        projects={projects}
        selectedProjectName={stickyProject?.name}
        onSelectProject={setStickyProject}
      />

      <FixerDefinitionForm
        state={state}
        textareaRef={textareaRef}
        placeholder={PLACEHOLDER_EXAMPLES[placeholderIdx]}
        aiStreaming={aiStreaming}
        planningMission={planningMission}
        latestAIContent={latestAIContent}
        latestSystemError={latestSystemError}
        planningFailed={planningFailed}
        showManualAdd={showManualAdd}
        manualName={manualName}
        manualSuggestions={manualSuggestions}
        manualHelperText={manualHelperText}
        manualAddDisabled={!nextManualOption}
        installedProjects={installedProjects}
        onTitleChange={onTitleChange}
        onDescriptionChange={onDescriptionChange}
        onTargetClustersChange={onTargetClustersChange}
        onSubmit={handleSubmit}
        onRetry={() => onAskAI(state.description, state.projects)}
        onToggleManualAdd={() => setShowManualAdd((value) => !value)}
        onManualNameChange={setManualName}
        onManualAdd={() => handleManualAdd()}
        onManualSuggestionSelect={handleManualAdd}
        onRemoveProject={onRemoveProject}
        onUpdatePriority={onUpdatePriority}
        onCardClick={setStickyProject}
      />

      <div className="w-104 border-l border-border bg-card flex flex-col overflow-y-auto shrink-0">
        <AnimatePresence mode="wait">
          {stickyProject ? (
            <motion.div
              key={`p-${stickyProject.name}`}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.12 }}
              className="p-4 space-y-4"
            >
              <ProjectDetailPanel
                project={projects.find((project) => project.name === stickyProject.name) ?? stickyProject}
                allProjects={projects}
                onAddAlternative={(newProject) => {
                  onAddProject(newProject)
                  setStickyProject(newProject)
                }}
                onReplace={onReplaceProject ? (oldName, newProject) => {
                  onReplaceProject(oldName, newProject)
                  setStickyProject(newProject)
                } : undefined}
              />
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-6"
            >
              <Info className="w-8 h-8 mb-3 opacity-30" />
              <p className="text-sm text-center">Click a project card for details</p>
              <p className="text-xs text-center mt-1 opacity-60">
                See AI reasoning, install steps, dependencies, and alternatives
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
