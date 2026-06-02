import { useEffect, type MutableRefObject } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import type { Mission } from '../../../hooks/useMissions'
import type { MissionExport } from '../../../lib/missions/types'
import {
  MISSION_BROWSER_QUERY_KEY,
  MISSION_BROWSER_QUERY_VALUE,
  MISSION_DEEP_LINK_QUERY_KEY,
  MISSION_VIEW_QUERY_KEY,
  MISSION_CHAT_VIEW,
  MISSION_IMPORT_QUERY_KEY,
  MISSION_CONTROL_QUERY_KEY,
  MISSION_PLAN_QUERY_KEY,
  MISSION_BROWSER_HISTORY_STATE_KEY,
} from './missionSidebarConstants'
import { ROUTES } from '../../../config/routes'
import { MISSION_FILE_FETCH_TIMEOUT_MS } from '../../../lib/missions/missionCache'

type SetSearchParams = (params: URLSearchParams, options?: { replace?: boolean }) => void

export function useMissionBrowserDeepLink(
  showBrowser: boolean,
  setShowBrowser: (show: boolean) => void,
  browserHistoryEntryRef: MutableRefObject<boolean>,
  missions: Mission[],
  setActiveMission: (id: string | null) => void,
  openSidebar: () => void,
  setFullScreen: (full: boolean) => void
) {
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()

  const deepLinkMission = searchParams.get(MISSION_DEEP_LINK_QUERY_KEY)
  const missionViewParam = searchParams.get(MISSION_VIEW_QUERY_KEY)
  const browseParam = searchParams.get(MISSION_BROWSER_QUERY_KEY)
  const isMissionBrowserRoute = location.pathname === ROUTES.MISSIONS
  const isMissionChatView = missionViewParam === MISSION_CHAT_VIEW
  const fullScreenMissionFromUrl = isMissionChatView && deepLinkMission
    ? missions.find((mission) => mission.id === deepLinkMission) || null
    : null
  const isMissionBrowserDeepLink = !isMissionChatView
    && (Boolean(deepLinkMission) || browseParam === MISSION_BROWSER_QUERY_VALUE || isMissionBrowserRoute)

  const getMissionBrowserSearchParams = () => {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete(MISSION_DEEP_LINK_QUERY_KEY)
    nextParams.delete(MISSION_BROWSER_QUERY_KEY)
    return nextParams
  }

  const openMissionBrowser = () => {
    if (typeof window !== 'undefined' && !isMissionBrowserDeepLink && !browserHistoryEntryRef.current) {
      const currentState = window.history.state
      const nextState = currentState && typeof currentState === 'object'
        ? { ...(currentState as Record<string, unknown>), [MISSION_BROWSER_HISTORY_STATE_KEY]: true }
        : { [MISSION_BROWSER_HISTORY_STATE_KEY]: true }
      window.history.pushState(nextState, '', window.location.href)
      browserHistoryEntryRef.current = true
    }
    setShowBrowser(true)
  }

  const closeMissionBrowser = () => {
    if (isMissionBrowserRoute) {
      const nextParams = getMissionBrowserSearchParams()
      const nextSearch = nextParams.toString()
      setShowBrowser(false)
      navigate({ pathname: ROUTES.HOME, search: nextSearch ? `?${nextSearch}` : '' }, { replace: true })
      return
    }
    if (isMissionBrowserDeepLink) {
      setShowBrowser(false)
      setSearchParams(getMissionBrowserSearchParams(), { replace: true })
      return
    }
    if (browserHistoryEntryRef.current && typeof window !== 'undefined') {
      window.history.back()
      return
    }
    setShowBrowser(false)
  }

  useEffect(() => {
    if (isMissionBrowserDeepLink) {
      setShowBrowser(true)
    }
  }, [isMissionBrowserDeepLink, setShowBrowser])

  useEffect(() => {
    if (!isMissionChatView) {
      return
    }

    if (!fullScreenMissionFromUrl) {
      if (deepLinkMission) {
        const nextParams = new URLSearchParams(searchParams)
        nextParams.delete(MISSION_DEEP_LINK_QUERY_KEY)
        nextParams.delete(MISSION_VIEW_QUERY_KEY)
        setSearchParams(nextParams, { replace: true })
      }
      return
    }

    setActiveMission(fullScreenMissionFromUrl.id)
    openSidebar()
    setFullScreen(true)
  }, [
    deepLinkMission,
    fullScreenMissionFromUrl,
    isMissionChatView,
    openSidebar,
    searchParams,
    setActiveMission,
    setFullScreen,
    setSearchParams,
  ])

  useEffect(() => {
    const activeMission = missions.find((mission) => mission.id === deepLinkMission)
    const nextParams = new URLSearchParams(searchParams)
    const isFullScreenMission = fullScreenMissionFromUrl !== null

    if (isFullScreenMission && activeMission) {
      nextParams.set(MISSION_DEEP_LINK_QUERY_KEY, activeMission.id)
      nextParams.set(MISSION_VIEW_QUERY_KEY, MISSION_CHAT_VIEW)
    } else if (searchParams.get(MISSION_VIEW_QUERY_KEY) === MISSION_CHAT_VIEW) {
      nextParams.delete(MISSION_VIEW_QUERY_KEY)
      if (!activeMission || searchParams.get(MISSION_DEEP_LINK_QUERY_KEY) === activeMission.id) {
        nextParams.delete(MISSION_DEEP_LINK_QUERY_KEY)
      }
    } else {
      return
    }

    if (nextParams.toString() !== searchParams.toString()) {
      setSearchParams(nextParams, { replace: true })
    }
  }, [fullScreenMissionFromUrl, missions, deepLinkMission, searchParams, setSearchParams])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const handlePopState = () => {
      if (!showBrowser) {
        return
      }
      browserHistoryEntryRef.current = false
      setShowBrowser(false)
    }

    window.addEventListener('popstate', handlePopState)
    return () => {
      window.removeEventListener('popstate', handlePopState)
    }
  }, [browserHistoryEntryRef, setShowBrowser, showBrowser])

  return {
    openMissionBrowser,
    closeMissionBrowser,
    deepLinkMission,
  }
}

export function useMissionControlDeepLink(
  searchParams: URLSearchParams,
  setSearchParams: SetSearchParams,
  openFreshMissionControl: () => void,
  setPendingKubaraChart: (chart: string | undefined) => void,
  setPendingReviewPlan: (plan: string | undefined) => void,
  setMissionControlFreshSessionToken: (token: number | ((previous: number | undefined) => number) | undefined) => void,
  setShowMissionControl: (show: boolean) => void
) {
  const missionControlParam = searchParams.get(MISSION_CONTROL_QUERY_KEY)

  useEffect(() => {
    if (missionControlParam === 'open') {
      openFreshMissionControl()
      const newParams = new URLSearchParams(searchParams)
      newParams.delete(MISSION_CONTROL_QUERY_KEY)
      setSearchParams(newParams, { replace: true })
    } else if (missionControlParam === 'restore') {
      // Open the dialog without triggering fresh-session reset.
      // Used by E2E tests to preserve seeded localStorage state (#16079).
      setPendingKubaraChart(undefined)
      setPendingReviewPlan(undefined)
      setMissionControlFreshSessionToken(undefined)
      setShowMissionControl(true)
      const newParams = new URLSearchParams(searchParams)
      newParams.delete(MISSION_CONTROL_QUERY_KEY)
      setSearchParams(newParams, { replace: true })
    } else if (missionControlParam === 'review') {
      const planParam = searchParams.get(MISSION_PLAN_QUERY_KEY)
      if (planParam) {
        setPendingKubaraChart(undefined)
        setPendingReviewPlan(planParam)
        setMissionControlFreshSessionToken(undefined)
        setShowMissionControl(true)
      }
      const newParams = new URLSearchParams(searchParams)
      newParams.delete(MISSION_CONTROL_QUERY_KEY)
      newParams.delete(MISSION_PLAN_QUERY_KEY)
      setSearchParams(newParams, { replace: true })
    }
  }, [
    missionControlParam,
    openFreshMissionControl,
    searchParams,
    setSearchParams,
    setPendingKubaraChart,
    setPendingReviewPlan,
    setMissionControlFreshSessionToken,
    setShowMissionControl,
  ])
}

export function useDirectImport(
  directImportSlug: string | null,
  searchParams: URLSearchParams,
  setSearchParams: SetSearchParams,
  prefetchedMission: MissionExport | undefined,
  setIsDirectImporting: (importing: boolean) => void,
  handleImportMission: (mission: MissionExport) => void,
  openMissionBrowser: () => void
) {
  useEffect(() => {
    if (!directImportSlug) {
      return
    }

    const newParams = new URLSearchParams(searchParams)
    newParams.delete(MISSION_IMPORT_QUERY_KEY)
    setSearchParams(newParams, { replace: true })

    if (prefetchedMission) {
      handleImportMission(prefetchedMission)
      window.history.replaceState({}, '')
      return
    }

    const knowledgeBaseDirs = [
      'cncf-install', 'cncf-generated', 'security', 'platform-install',
      'llm-d', 'multi-cluster', 'troubleshoot', 'troubleshooting',
      'cost-optimization', 'networking', 'observability', 'workloads',
    ]
    const paths = [
      ...knowledgeBaseDirs.map((dir) => `fixes/${dir}/${directImportSlug}.json`),
      `fixes/${directImportSlug}.json`,
    ]

    const tryImport = async () => {
      setIsDirectImporting(true)
      const controller = new AbortController()
      const timeoutSignal = AbortSignal.timeout(MISSION_FILE_FETCH_TIMEOUT_MS)
      const combinedSignal = AbortSignal.any([controller.signal, timeoutSignal])
      let found: MissionExport | null = null
      try {
        found = await Promise.any(paths.map(async (path) => {
          const response = await fetch(`/api/missions/file?path=${encodeURIComponent(path)}`, {
            signal: combinedSignal,
          })
          if (!response.ok) {
            throw new Error('not found')
          }
          const raw = await response.text()
          const parsed = JSON.parse(raw)
          const { validateMissionExport } = await import('../../../lib/missions/types')
          const result = validateMissionExport(parsed)
          if (!result.valid) {
            throw new Error('invalid')
          }
          controller.abort()
          return result.data
        }))
      } catch {
        found = null
      }
      if (found) {
        handleImportMission(found)
        return
      }

      try {
        const response = await fetch('/api/missions/file?path=fixes/index.json', {
          signal: AbortSignal.timeout(MISSION_FILE_FETCH_TIMEOUT_MS),
        })
        if (response.ok) {
          const index = await response.json() as { missions?: Array<{ path: string }> }
          const match = (index.missions || []).find((mission) => {
            const filename = (mission.path || '').split('/').pop() || ''
            return filename.replace('.json', '') === directImportSlug
          })
          if (match) {
            const fileResponse = await fetch(`/api/missions/file?path=${encodeURIComponent(match.path)}`, {
              signal: AbortSignal.timeout(MISSION_FILE_FETCH_TIMEOUT_MS),
            })
            if (fileResponse.ok) {
              const raw = await fileResponse.text()
              const parsed = JSON.parse(raw)
              const { validateMissionExport } = await import('../../../lib/missions/types')
              const result = validateMissionExport(parsed)
              if (result.valid) {
                handleImportMission(result.data)
                return
              }
            }
          }
        }
      } catch {
        // ignore index fallback errors
      }

      openMissionBrowser()
    }

    tryImport().finally(() => setIsDirectImporting(false))
  }, [directImportSlug, handleImportMission, openMissionBrowser, prefetchedMission, searchParams, setIsDirectImporting, setSearchParams])
}
