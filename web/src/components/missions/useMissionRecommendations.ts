import { useEffect, useRef, useState } from 'react'
import type { ClusterContext } from '../../hooks/useClusterContext'
import { matchMissionsToCluster } from '../../lib/missions/matcher'
import type { MissionExport, MissionMatch } from '../../lib/missions/types'
import {
  missionCache,
  getCachedRecommendations,
  setCachedRecommendations,
  startMissionCacheFetch,
} from './browser'

interface SearchProgress {
  step: string
  detail: string
  found: number
  scanned: number
}

export function useMissionRecommendations(isOpen: boolean, clusterContext: ClusterContext | null) {
  const clusterContextRef = useRef(clusterContext)
  clusterContextRef.current = clusterContext

  const [installerMissions, setInstallerMissions] = useState<MissionExport[]>(missionCache.installers)
  const [fixerMissions, setFixerMissions] = useState<MissionExport[]>(missionCache.fixes)
  const [missionFetchError, setMissionFetchError] = useState<string | null>(missionCache.fetchError)
  const [recommendations, setRecommendations] = useState<MissionMatch[]>([])
  const [loadingRecommendations, setLoadingRecommendations] = useState(false)
  const [searchProgress, setSearchProgress] = useState<SearchProgress>({
    step: '',
    detail: '',
    found: 0,
    scanned: 0,
  })
  const [tokenError] = useState<'rate_limited' | 'token_invalid' | null>(null)
  const [hasCluster, setHasCluster] = useState(false)

  useEffect(() => {
    if (!isOpen) return

    const updateRecommendations = () => {
      const allMissions = [...missionCache.fixes]
      if (allMissions.length === 0) {
        if (!missionCache.fixesDone) {
          setLoadingRecommendations(true)
          setSearchProgress({ step: 'Scanning', detail: 'Loading fixes...', found: 0, scanned: 0 })
        }
        return
      }

      const cached = getCachedRecommendations(clusterContextRef.current)
      if (cached) {
        setRecommendations(cached)
        setHasCluster(Boolean(clusterContextRef.current))
        setLoadingRecommendations(false)
        const done = missionCache.fixesDone
        setSearchProgress({
          step: done ? 'Done' : 'Scanning',
          detail: `${allMissions.length} fixes`,
          found: allMissions.length,
          scanned: allMissions.length,
        })
        return
      }

      const cluster = clusterContextRef.current
      setHasCluster(Boolean(cluster))
      const matched = matchMissionsToCluster(allMissions, cluster)
      setCachedRecommendations(matched, cluster)
      setRecommendations(matched)
      setLoadingRecommendations(false)
      const done = missionCache.fixesDone
      setSearchProgress({
        step: done ? 'Done' : 'Scanning',
        detail: `${allMissions.length} fixes`,
        found: allMissions.length,
        scanned: allMissions.length,
      })
    }

    updateRecommendations()
    missionCache.listeners.add(updateRecommendations)
    return () => {
      missionCache.listeners.delete(updateRecommendations)
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return

    setInstallerMissions([...missionCache.installers])
    setFixerMissions([...missionCache.fixes])

    const listener = () => {
      setInstallerMissions([...missionCache.installers])
      setFixerMissions([...missionCache.fixes])
      setMissionFetchError(missionCache.fetchError)
    }

    missionCache.listeners.add(listener)
    startMissionCacheFetch()

    return () => {
      missionCache.listeners.delete(listener)
    }
  }, [isOpen])

  return {
    installerMissions,
    fixerMissions,
    missionFetchError,
    loadingInstallers: !missionCache.installersDone,
    loadingFixers: !missionCache.fixesDone,
    recommendations,
    loadingRecommendations,
    searchProgress,
    tokenError,
    hasCluster,
  }
}
