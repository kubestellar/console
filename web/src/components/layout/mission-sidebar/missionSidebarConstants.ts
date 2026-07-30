import type { Mission } from '../../../hooks/useMissions'

export const ATTENTION_MISSION_STATUSES: ReadonlySet<Mission['status']> = new Set(['waiting_input', 'blocked'])
export const BACKGROUND_EXECUTION_STATUSES: ReadonlySet<Mission['status']> = new Set(['pending', 'running', 'cancelling'])
export const BACKGROUND_MISSION_PREVIEW_LIMIT = 3
export const MISSION_BROWSER_QUERY_KEY = 'browse'
export const MISSION_BROWSER_QUERY_VALUE = 'missions'
export const MISSION_DEEP_LINK_QUERY_KEY = 'mission'
export const MISSION_VIEW_QUERY_KEY = 'view'
export const MISSION_CHAT_VIEW = 'chat'
export const MISSION_IMPORT_QUERY_KEY = 'import'
export const MISSION_CONTROL_QUERY_KEY = 'mission-control'
export const MISSION_PLAN_QUERY_KEY = 'plan'
export const MISSION_BROWSER_HISTORY_STATE_KEY = 'kscMissionBrowserOpen'
export const FULLSCREEN_KNOWLEDGE_PANEL_WIDTH_CLASS = 'w-80 xl:w-96'
export const MISSION_CONTROL_BUTTON_CLASSES = 'appearance-none isolate overflow-hidden border border-transparent bg-linear-to-r from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-500/25 hover:from-purple-500 hover:to-indigo-500'
export const MISSIONS_PAGE_SIZE = 20
export const HISTORY_PANEL_KEY = 'ksc-mission-history-panel'

export function getMissionAttentionCount(missions: Mission[]): number {
  return missions.filter(mission => ATTENTION_MISSION_STATUSES.has(mission.status)).length
}

export function matchesMissionSearch(mission: Mission, normalizedQuery: string): boolean {
  if (!normalizedQuery) return true
  return mission.title.toLowerCase().includes(normalizedQuery) || mission.description.toLowerCase().includes(normalizedQuery)
}
