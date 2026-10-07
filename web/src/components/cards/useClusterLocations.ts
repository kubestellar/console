import { useMemo, useState, useRef } from 'react'
import type { ClusterInfo } from '../../hooks/useMCP'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { detectCloudProvider } from '../ui/CloudProviderIcon'
import DOMPurify from 'dompurify'
import WorldMapSvgUrl from '../../assets/world-map.svg'
import { useCache } from '../../lib/cache'
import { FETCH_EXTERNAL_TIMEOUT_MS } from '../../lib/constants/network'
import {
  SEARCH_DEBOUNCE_MS,
  REGION_COORDINATES,
  type RegionInfo,
  type StatusFilter,
} from './ClusterLocations.constants'
import { extractRegion } from './ClusterLocations.region'

/** Map SVG, filter state, region grouping and pan/zoom handlers for ClusterLocations. */
export function useClusterLocations(allClusters: ClusterInfo[]) {
  const {
    selectedClusters: globalSelectedClusters,
    isAllClustersSelected,
    customFilter } = useGlobalFilters()

  // Map SVG via useCache (persists across navigation, avoids re-fetch)
  const { data: mapSvg, isLoading: mapLoading, isFailed: mapError } = useCache<string>({
    key: 'cluster-locations-map-svg',
    initialData: '',
    persist: true,
    fetcher: async () => {
      const res = await fetch(WorldMapSvgUrl, { signal: AbortSignal.timeout(FETCH_EXTERNAL_TIMEOUT_MS) })
      if (!res.ok) throw new Error('Failed to load map')
      const svg = await res.text()
      // Sanitize SVG to prevent XSS from embedded scripts or event handlers
      return DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true } })
    },
    autoRefresh: false,
  })

  // Map controls state
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [panStart, setPanStart] = useState({ x: 0, y: 0 })
  const mapRef = useRef<HTMLDivElement>(null)

  // Filter state
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [showFilters, setShowFilters] = useState(false)
  const [searchFilter, setSearchFilter] = useState('')
  // #6213: debounce the heavy filter so the cluster filter pipeline
  // (which feeds region grouping + map markers) doesn't re-run on
  // every keystroke. The <input value={searchFilter}/> still updates
  // at typing speed.
  const debouncedSearchFilter = useDebouncedValue(searchFilter, SEARCH_DEBOUNCE_MS)

  // Hover state
  const [hoveredCluster, setHoveredCluster] = useState<string | null>(null)

  // Step 1: Global/reachability scoping only — no status chip, no local search.
  // Stats tiles read from here so their counts remain accurate when a filter is active.
  const baseClusters = useMemo(() => {
    let result = allClusters.filter(c => c.reachable !== false)

    if (!isAllClustersSelected) {
      result = result.filter(c => globalSelectedClusters.includes(c.name))
    }

    if (customFilter.trim()) {
      const query = customFilter.toLowerCase()
      result = result.filter(c =>
        c.name.toLowerCase().includes(query) ||
        c.context?.toLowerCase().includes(query)
      )
    }

    return result
  }, [allClusters, globalSelectedClusters, isAllClustersSelected, customFilter])

  // Step 2: Apply status chip and local search on top for map markers and the cluster list.
  const clusters = useMemo(() => {
    let result = baseClusters

    if (statusFilter === 'healthy') {
      result = result.filter(c => c.healthy)
    } else if (statusFilter === 'unhealthy') {
      result = result.filter(c => !c.healthy)
    }

    if (debouncedSearchFilter.trim()) {
      const query = debouncedSearchFilter.toLowerCase()
      result = result.filter(c =>
        c.name.toLowerCase().includes(query) ||
        c.context?.toLowerCase().includes(query)
      )
    }

    return result
  }, [baseClusters, statusFilter, debouncedSearchFilter])

  // Group clusters by region
  const regionGroups = useMemo(() => {
    const groups = new Map<string, RegionInfo>()

    for (const cluster of clusters) {
      const region = extractRegion(cluster) || 'unknown'
      const provider = detectCloudProvider(cluster.name, cluster.server, cluster.namespaces)
      const coords = REGION_COORDINATES[region] || REGION_COORDINATES['unknown']

      if (!groups.has(region)) {
        groups.set(region, {
          region,
          displayName: coords.label || region,
          provider,
          clusters: [],
          coordinates: coords })
      }

      groups.get(region)!.clusters.push(cluster)
    }

    return Array.from(groups.values()).sort((a, b) => b.clusters.length - a.clusters.length)
  }, [clusters])

  // Stats always read from baseClusters so chip/search filters don't change fleet totals.
  const stats = useMemo(() => {
    const healthyClusters = baseClusters.filter(c => c.healthy).length
    const uniqueRegions = new Set(baseClusters.map(c => extractRegion(c) || 'unknown')).size
    const providers = new Set(baseClusters.map(c => detectCloudProvider(c.name, c.server, c.namespaces)))
    return { healthyClusters, totalClusters: baseClusters.length, uniqueRegions, providerCount: providers.size }
  }, [baseClusters])

  // Memoize provider legend to avoid expensive flatMap+Set on every render
  const MAX_LEGEND_PROVIDERS = 5
  const providerLegend = useMemo(() => {
    return Array.from(new Set(regionGroups.flatMap(r => r.clusters.map(c => detectCloudProvider(c.name, c.server, c.namespaces))))).slice(0, MAX_LEGEND_PROVIDERS)
  }, [regionGroups])

  // Map controls
  const handleZoomIn = () => {
    setZoom(z => Math.min(z * 1.5, 4))
  }

  const handleZoomOut = () => {
    setZoom(z => Math.max(z / 1.5, 0.5))
  }

  const handleReset = () => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) {
      setIsPanning(true)
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y })
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setPan({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y })
    }
  }

  const handleMouseUp = () => {
    setIsPanning(false)
  }

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    if (e.deltaY < 0) {
      setZoom(z => Math.min(z * 1.1, 4))
    } else {
      setZoom(z => Math.max(z / 1.1, 0.5))
    }
  }

  return {
    mapSvg,
    mapLoading,
    mapError,
    zoom,
    pan,
    mapRef,
    statusFilter,
    setStatusFilter,
    showFilters,
    setShowFilters,
    searchFilter,
    setSearchFilter,
    hoveredCluster,
    setHoveredCluster,
    regionGroups,
    stats,
    providerLegend,
    handleZoomIn,
    handleZoomOut,
    handleReset,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleWheel,
  }
}
