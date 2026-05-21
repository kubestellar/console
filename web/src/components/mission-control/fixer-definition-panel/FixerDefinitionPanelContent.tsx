/**
FixerDefinitionPanel  * Phase 1 of Mission Control. 
 *
 * Left: summary sidebar.
 * Center: mission definition form.
 * Right: project details for the selected payload item.
 */

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Info } from 'lucide-react'
import type { Mission } from '../../../hooks/useMissions'
import { getAssistantContentSinceLastUser } from '../useMissionControl'
import type { MissionControlState, PayloadProject } from '../types'
import { PLACEHOLDER_EXAMPLES } from './fixerDefinitionPanel.constants'
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
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const projects = state.projects || []

  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderIdx((value) => (value + 1) % PLACEHOLDER_EXAMPLES.length)
    }, 4000)

    return () => clearInterval(interval)
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

  const handleSubmit = () => {
    if (!state.title && state.description.trim()) {
      const firstSentence = state.description.split(/[.!?\n]/)[0].trim()
      onTitleChange(firstSentence.slice(0, 60))
    }

    onAskAI(state.description, state.projects)
  }

  const handleManualAdd = () => {
    if (!manualName.trim()) {
      return
    }

    onAddProject({
      name: manualName.toLowerCase().replace(/\s+/g, '-'),
      displayName: manualName.trim(),
      reason: 'Manually added',
      category: 'Custom',
      priority: 'recommended',
      dependencies: [],
    })
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
        installedProjects={installedProjects}
        onTitleChange={onTitleChange}
        onDescriptionChange={onDescriptionChange}
        onTargetClustersChange={onTargetClustersChange}
        onSubmit={handleSubmit}
        onRetry={() => onAskAI(state.description, state.projects)}
        onToggleManualAdd={() => setShowManualAdd((value) => !value)}
        onManualNameChange={setManualName}
        onManualAdd={handleManualAdd}
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
