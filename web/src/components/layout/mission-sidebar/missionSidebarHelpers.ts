import type { Mission, SaveMissionParams } from '../../../hooks/useMissions'
import type { MissionExport } from '../../../lib/missions/types'
import type { Resolution } from '../../../hooks/useResolutions'
import { SAVED_TOAST_MS } from '../../../lib/constants/network'

export function handleApplyResolution(
  activeMission: Mission | null,
  resolution: Resolution,
  sendMessage: (missionId: string, message: string) => void
) {
  if (!activeMission) return

  const NON_APPLIABLE_STATUSES = new Set(['blocked', 'pending', 'cancelling', 'running'])
  if (NON_APPLIABLE_STATUSES.has(activeMission.status)) {
    return
  }

  const stepsText = (resolution.resolution.steps || []).length > 0
    ? `\n\nSteps:\n${(resolution.resolution.steps || []).map((s: string, i: number) => `${i + 1}. ${s}`).join('\n')}`
    : ''
  const applyMessage = `Please apply this saved resolution:\n\n**${resolution.title}**\n\n${resolution.resolution.summary}${stepsText}${resolution.resolution.yaml ? `\n\nYAML:\n\`\`\`yaml\n${resolution.resolution.yaml}\n\`\`\`` : ''}`
  sendMessage(activeMission.id, applyMessage)
}

export function handleRollback(
  mission: Mission,
  startMission: (params: {
    title: string
    description: string
    type: 'repair'
    cluster?: string
    initialPrompt: string
  }) => void,
  openSidebar: () => void
) {
  const agentMessages = (mission.messages || [])
    .filter(m => m.role === 'assistant' && m.content)
    .map(m => m.content)
    .join('\n')

  const rollbackPrompt = [
    `The following AI mission was interrupted or failed and may have left the cluster in an inconsistent state.`,
    `Original mission: "${mission.title}"`,
    mission.cluster ? `Cluster: ${mission.cluster}` : '',
    `Status: ${mission.status}`,
    ``,
    `Here is a summary of what the mission attempted:`,
    agentMessages.slice(0, 2000),
    ``,
    `Please analyze what changes were likely applied and reverse them safely.`,
    `Check the current state of the cluster first, identify any partially-applied changes,`,
    `and roll them back. Ask me before making destructive changes.`,
  ].filter(Boolean).join('\n')

  startMission({
    title: `Rollback: ${mission.title}`,
    description: `Reverse changes from interrupted mission "${mission.title}"`,
    type: 'repair',
    cluster: mission.cluster,
    initialPrompt: rollbackPrompt,
  })
  openSidebar()
}

export function handleImportMission(
  mission: MissionExport,
  saveMission: (params: SaveMissionParams) => string,
  openSidebar: () => void,
  setActiveMission: (id: string) => void,
  setShowSavedToast: (title: string) => void,
  setToastCountdown: (updater: number | ((prev: number) => number)) => void,
  toastIntervalRef: React.MutableRefObject<ReturnType<typeof setInterval> | null>
) {
  const missionType = mission.missionClass === 'install' ? 'deploy' as const
    : mission.type === 'troubleshoot' ? 'troubleshoot' as const
    : mission.type === 'deploy' ? 'deploy' as const
    : mission.type === 'upgrade' ? 'upgrade' as const
    : 'custom' as const

  const missionId = saveMission({
    type: missionType,
    title: mission.title,
    description: mission.description || mission.title,
    missionClass: mission.missionClass,
    cncfProject: mission.cncfProject,
    steps: mission.steps?.map(s => ({ title: s.title, description: s.description })),
    tags: mission.tags,
    initialPrompt: mission.resolution?.summary || mission.description || '' })

  openSidebar()
  setActiveMission(missionId)

  // Show extended help toast only on first import
  const hasImportedBefore = localStorage.getItem('ksc-has-imported')
  if (!hasImportedBefore) {
    localStorage.setItem('ksc-has-imported', new Date().toISOString())
    setShowSavedToast(mission.title)
    const FIRST_IMPORT_COUNTDOWN_S = 60
    setToastCountdown(FIRST_IMPORT_COUNTDOWN_S)

    if (toastIntervalRef.current) {
      clearInterval(toastIntervalRef.current)
    }
    toastIntervalRef.current = setInterval(() => {
      setToastCountdown((prev: number) => {
        if (prev <= 1) {
          if (toastIntervalRef.current) {
            clearInterval(toastIntervalRef.current)
            toastIntervalRef.current = null
          }
          setShowSavedToast('')
          return 0
        }
        return prev - 1
      })
    }, 1000)
  } else {
    setShowSavedToast(mission.title)
    setTimeout(() => setShowSavedToast(''), SAVED_TOAST_MS)
  }
}

export function savedMissionToExport(m: Mission): MissionExport {
  return {
    version: '1.0',
    title: m.importedFrom?.title || m.title,
    description: m.importedFrom?.description || m.description,
    type: m.type,
    tags: m.importedFrom?.tags || [],
    missionClass: m.importedFrom?.missionClass as MissionExport['missionClass'],
    cncfProject: m.importedFrom?.cncfProject,
    steps: (m.importedFrom?.steps || []).map(s => ({
      title: s.title,
      description: s.description })) }
}
