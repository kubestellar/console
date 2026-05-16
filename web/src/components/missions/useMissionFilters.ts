import { useMemo, useState } from 'react'
import type { MissionExport, MissionMatch } from '../../lib/missions/types'
import {
  filterInstallers,
  filterFixers,
  computeFacetCounts,
  filterRecommendations,
} from './missionBrowserFilters'
import {
  computeActiveFilterCount,
} from './missionBrowserFilterState'

export function useMissionFilters({
  recommendations,
  installerMissions,
  fixerMissions,
}: {
  recommendations: MissionMatch[]
  installerMissions: MissionExport[]
  fixerMissions: MissionExport[]
}) {
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('All')
  const [cncfFilter, setCncfFilter] = useState<string>('')
  const [minMatchPercent, setMinMatchPercent] = useState<number>(25)
  const [matchSourceFilter, setMatchSourceFilter] = useState<'all' | 'cluster' | 'community'>('all')
  const [maturityFilter, setMaturityFilter] = useState<string>('All')
  const [missionClassFilter, setMissionClassFilter] = useState<string>('All')
  const [difficultyFilter, setDifficultyFilter] = useState<string>('All')
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set())
  const [installerCategoryFilter, setInstallerCategoryFilter] = useState<string>('All')
  const [installerMaturityFilter, setInstallerMaturityFilter] = useState<string>('All')
  const [fixerTypeFilter, setFixerTypeFilter] = useState<string>('All')
  const [installerSearch, setInstallerSearch] = useState('')
  const [fixerSearch, setFixerSearch] = useState('')

  const effectiveInstallerSearch = installerSearch || searchQuery
  const effectiveFixerSearch = fixerSearch || searchQuery

  const handleInstallerSearchChange = (value: string) => {
    setInstallerSearch(value)
    if (value && searchQuery) setSearchQuery('')
  }

  const handleFixerSearchChange = (value: string) => {
    setFixerSearch(value)
    if (value && searchQuery) setSearchQuery('')
  }

  const filteredInstallers = useMemo(
    () => filterInstallers(installerMissions, {
      categoryFilter: installerCategoryFilter,
      maturityFilter: installerMaturityFilter,
      search: effectiveInstallerSearch,
    }),
    [effectiveInstallerSearch, installerCategoryFilter, installerMaturityFilter, installerMissions],
  )

  const filteredFixers = useMemo(
    () => filterFixers(fixerMissions, {
      typeFilter: fixerTypeFilter,
      search: effectiveFixerSearch,
    }),
    [effectiveFixerSearch, fixerMissions, fixerTypeFilter],
  )

  const facetCounts = useMemo(() => computeFacetCounts(recommendations), [recommendations])

  const activeFilterCount = useMemo(() => computeActiveFilterCount({
    minMatchPercent,
    categoryFilter,
    matchSourceFilter,
    maturityFilter,
    missionClassFilter,
    difficultyFilter,
    selectedTags,
    cncfFilter,
  }), [
    categoryFilter,
    cncfFilter,
    difficultyFilter,
    matchSourceFilter,
    maturityFilter,
    minMatchPercent,
    missionClassFilter,
    selectedTags,
  ])

  const clearAllFilters = () => {
    setMinMatchPercent(0)
    setCategoryFilter('All')
    setMatchSourceFilter('all')
    setMaturityFilter('All')
    setMissionClassFilter('All')
    setDifficultyFilter('All')
    setSelectedTags(new Set())
    setCncfFilter('')
    setSearchQuery('')
  }

  const filteredRecommendations = useMemo(
    () => filterRecommendations(recommendations, {
      minMatchPercent,
      matchSourceFilter,
      categoryFilter,
      maturityFilter,
      missionClassFilter,
      difficultyFilter,
      selectedTags,
      cncfFilter,
      searchQuery,
    }),
    [
      recommendations,
      minMatchPercent,
      matchSourceFilter,
      categoryFilter,
      maturityFilter,
      missionClassFilter,
      difficultyFilter,
      selectedTags,
      cncfFilter,
      searchQuery,
    ],
  )

  return {
    searchQuery,
    setSearchQuery,
    categoryFilter,
    setCategoryFilter,
    cncfFilter,
    setCncfFilter,
    minMatchPercent,
    setMinMatchPercent,
    matchSourceFilter,
    setMatchSourceFilter,
    maturityFilter,
    setMaturityFilter,
    missionClassFilter,
    setMissionClassFilter,
    difficultyFilter,
    setDifficultyFilter,
    selectedTags,
    setSelectedTags,
    installerCategoryFilter,
    setInstallerCategoryFilter,
    installerMaturityFilter,
    setInstallerMaturityFilter,
    fixerTypeFilter,
    setFixerTypeFilter,
    installerSearch,
    fixerSearch,
    handleInstallerSearchChange,
    handleFixerSearchChange,
    filteredInstallers,
    filteredFixers,
    facetCounts,
    activeFilterCount,
    clearAllFilters,
    filteredRecommendations,
  }
}
