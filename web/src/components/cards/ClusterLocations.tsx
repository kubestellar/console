import { useMemo, useState, useRef, useCallback, useEffect } from 'react'
import { Globe, Server, Cloud, ZoomIn, ZoomOut, Maximize2, Filter, X } from 'lucide-react'
import { useClusters, type ClusterInfo } from '../../hooks/useMCP'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { Skeleton } from '../ui/Skeleton'
import { detectCloudProvider, CloudProviderIcon, type CloudProvider } from '../ui/CloudProviderIcon'
import WorldMapSvgUrl from '../../assets/world-map.svg'
import { useCardLoadingState } from './CardDataContext'
import { useTranslation } from 'react-i18next'

interface ClusterLocationsProps {
  config?: Record<string, unknown>
}

// Region coordinates on the map (x, y as percentage)
const REGION_COORDINATES: Record<string, { x: number; y: number; label: string }> = {
  // AWS US regions
  'us-east-1': { x: 22, y: 38, label: 'N. Virginia' },
  'us-east-2': { x: 20, y: 36, label: 'Ohio' },
  'us-west-1': { x: 10, y: 40, label: 'N. California' },
  'us-west-2': { x: 8, y: 35, label: 'Oregon' },
  // AWS EU regions
  'eu-west-1': { x: 46, y: 30, label: 'Ireland' },
  'eu-west-2': { x: 48, y: 28, label: 'London' },
  'eu-west-3': { x: 50, y: 32, label: 'Paris' },
  'eu-central-1': { x: 52, y: 30, label: 'Frankfurt' },
  'eu-north-1': { x: 54, y: 22, label: 'Stockholm' },
  // AWS Asia Pacific regions
  'ap-northeast-1': { x: 88, y: 38, label: 'Tokyo' },
  'ap-northeast-2': { x: 85, y: 36, label: 'Seoul' },
  'ap-northeast-3': { x: 86, y: 40, label: 'Osaka' },
  'ap-southeast-1': { x: 78, y: 52, label: 'Singapore' },
  'ap-southeast-2': { x: 92, y: 75, label: 'Sydney' },
  'ap-south-1': { x: 70, y: 46, label: 'Mumbai' },
  // AWS Other regions
  'sa-east-1': { x: 30, y: 70, label: 'São Paulo' },
  'ca-central-1': { x: 20, y: 30, label: 'Canada' },
  'me-south-1': { x: 62, y: 44, label: 'Bahrain' },
  'af-south-1': { x: 55, y: 72, label: 'Cape Town' },
  // Azure regions
  'westeurope': { x: 50, y: 30, label: 'West Europe' },
  'eastus': { x: 22, y: 38, label: 'East US' },
  'eastus2': { x: 23, y: 40, label: 'East US 2' },
  'westus': { x: 8, y: 38, label: 'West US' },
  'westus2': { x: 9, y: 36, label: 'West US 2' },
  'northeurope': { x: 46, y: 26, label: 'North Europe' },
  'southeastasia': { x: 78, y: 52, label: 'Southeast Asia' },
  'australiaeast': { x: 92, y: 72, label: 'Australia East' },
  'centralus': { x: 16, y: 38, label: 'Central US' },
  'southcentralus': { x: 15, y: 44, label: 'South Central US' },
  'northcentralus': { x: 17, y: 34, label: 'North Central US' },
  'uksouth': { x: 48, y: 28, label: 'UK South' },
  'ukwest': { x: 46, y: 28, label: 'UK West' },
  'japaneast': { x: 88, y: 38, label: 'Japan East' },
  'japanwest': { x: 86, y: 40, label: 'Japan West' },
  'koreacentral': { x: 85, y: 36, label: 'Korea Central' },
  'brazilsouth': { x: 32, y: 68, label: 'Brazil South' },
  // GCP regions
  'us-central1': { x: 16, y: 38, label: 'Iowa' },
  'us-east1': { x: 21, y: 42, label: 'S. Carolina' },
  'us-east4': { x: 23, y: 38, label: 'N. Virginia' },
  'us-west1': { x: 8, y: 35, label: 'Oregon' },
  'us-west2': { x: 7, y: 40, label: 'Los Angeles' },
  'us-west3': { x: 12, y: 38, label: 'Salt Lake City' },
  'us-west4': { x: 10, y: 42, label: 'Las Vegas' },
  'europe-west1': { x: 51, y: 30, label: 'Belgium' },
  'europe-west2': { x: 48, y: 28, label: 'London' },
  'europe-west3': { x: 52, y: 30, label: 'Frankfurt' },
  'europe-west4': { x: 50, y: 28, label: 'Netherlands' },
  'europe-north1': { x: 56, y: 20, label: 'Finland' },
  'asia-east1': { x: 82, y: 44, label: 'Taiwan' },
  'asia-east2': { x: 80, y: 46, label: 'Hong Kong' },
  'asia-northeast1': { x: 88, y: 38, label: 'Tokyo' },
  'asia-northeast2': { x: 86, y: 40, label: 'Osaka' },
  'asia-northeast3': { x: 85, y: 36, label: 'Seoul' },
  'asia-south1': { x: 70, y: 46, label: 'Mumbai' },
  'asia-southeast1': { x: 78, y: 52, label: 'Singapore' },
  'australia-southeast1': { x: 92, y: 74, label: 'Sydney' },
  'southamerica-east1': { x: 32, y: 68, label: 'São Paulo' },
  // OCI regions
  'us-phoenix-1': { x: 12, y: 42, label: 'Phoenix' },
  'us-ashburn-1': { x: 22, y: 38, label: 'Ashburn' },
  'eu-frankfurt-1': { x: 52, y: 30, label: 'Frankfurt' },
  'uk-london-1': { x: 48, y: 28, label: 'London' },
  'ap-tokyo-1': { x: 88, y: 38, label: 'Tokyo' },
  'ap-mumbai-1': { x: 70, y: 46, label: 'Mumbai' },
  'ap-sydney-1': { x: 92, y: 74, label: 'Sydney' },
  // DigitalOcean regions
  'nyc1': { x: 23, y: 36, label: 'New York' },
  'nyc2': { x: 23.5, y: 36.5, label: 'New York' },
  'nyc3': { x: 24, y: 37, label: 'New York' },
  'sfo1': { x: 7, y: 40, label: 'San Francisco' },
  'sfo2': { x: 7.5, y: 40.5, label: 'San Francisco' },
  'sfo3': { x: 8, y: 41, label: 'San Francisco' },
  'ams2': { x: 50, y: 28, label: 'Amsterdam' },
  'ams3': { x: 50, y: 28, label: 'Amsterdam' },
  'sgp1': { x: 78, y: 52, label: 'Singapore' },
  'lon1': { x: 48, y: 28, label: 'London' },
  'fra1': { x: 52, y: 30, label: 'Frankfurt' },
  'tor1': { x: 21, y: 32, label: 'Toronto' },
  'blr1': { x: 72, y: 50, label: 'Bangalore' },
  // China regions
  'cn-shanghai': { x: 82, y: 42, label: 'Shanghai' },
  'cn-beijing': { x: 80, y: 38, label: 'Beijing' },
  'cn-hangzhou': { x: 82, y: 44, label: 'Hangzhou' },
  'cn-shenzhen': { x: 80, y: 48, label: 'Shenzhen' },
  // Local/unknown - center of map
  'local': { x: 50, y: 85, label: 'Local' },
  'unknown': { x: 50, y: 85, label: 'Unknown' },
}

interface RegionInfo {
  region: string
  displayName: string
  provider: CloudProvider
  clusters: ClusterInfo[]
  coordinates: { x: number; y: number; label: string }
}

// Extract region from cluster info - enhanced with node labels and vendor hints
function extractRegion(cluster: ClusterInfo): string | null {
  const name = cluster.name.toLowerCase()
  const serverUrl = cluster.server?.toLowerCase() || ''
  const context = cluster.context?.toLowerCase() || ''

  // AWS EKS - extract from URL or name
  const eksUrlMatch = serverUrl.match(/\.([a-z]{2}-[a-z]+-\d)\.eks\.amazonaws\.com/)
  if (eksUrlMatch) return eksUrlMatch[1]

  // AWS region patterns in names
  const awsRegionMatch = name.match(/(us-east-[12]|us-west-[12]|eu-west-[123]|eu-central-1|eu-north-1|ap-northeast-[123]|ap-southeast-[12]|ap-south-1|sa-east-1|ca-central-1|me-south-1|af-south-1)/i)
  if (awsRegionMatch) return awsRegionMatch[1].toLowerCase()

  // Azure AKS - extract from URL
  const aksUrlMatch = serverUrl.match(/\.hcp\.([a-z]+)\\.azmk8s\.io/)
  if (aksUrlMatch) return aksUrlMatch[1]

  // Azure region patterns
  const azureRegions = ['westeurope', 'eastus', 'eastus2', 'westus', 'westus2', 'northeurope', 'southeastasia', 'australiaeast', 'centralus', 'southcentralus', 'northcentralus', 'uksouth', 'ukwest', 'japaneast', 'japanwest', 'koreacentral', 'brazilsouth']
  for (const region of azureRegions) {
    if (name.includes(region) || context.includes(region)) return region
  }

  // GCP GKE - extract from name patterns
  const gcpRegionMatch = name.match(/(us-central1|us-east[14]|us-west[1-4]|europe-west[1-4]|europe-north1|asia-east[12]|asia-northeast[1-3]|asia-south1|asia-southeast1|australia-southeast1|southamerica-east1)/i)
  if (gcpRegionMatch) return gcpRegionMatch[1].toLowerCase()

  // OCI - extract from URL or name
  const ociUrlMatch = serverUrl.match(/\.([a-z]+-[a-z]+-\d)\.clusters\.oci/)
  if (ociUrlMatch) return ociUrlMatch[1]
  const ociRegions = ['us-phoenix-1', 'us-ashburn-1', 'eu-frankfurt-1', 'uk-london-1', 'ap-tokyo-1', 'ap-mumbai-1', 'ap-sydney-1']
  for (const region of ociRegions) {
    if (name.includes(region.replace(/-/g, '')) || name.includes(region)) return region
  }

  // DigitalOcean - extract region code
  const doMatch = name.match(/(nyc[123]|sfo[123]|ams[23]|sgp1|lon1|fra1|tor1|blr1)/i)
  if (doMatch) return doMatch[1].toLowerCase()

  // Check for common location keywords in name or context
  const locationKeywords: Record<string, string> = {
    'virginia': 'us-east-1',
    'ohio': 'us-east-2',
    'california': 'us-west-1',
    'oregon': 'us-west-2',
    'ireland': 'eu-west-1',
    'london': 'eu-west-2',
    'paris': 'eu-west-3',
    'frankfurt': 'eu-central-1',
    'stockholm': 'eu-north-1',
    'tokyo': 'ap-northeast-1',
    'osaka': 'ap-northeast-3',
    'seoul': 'ap-northeast-2',
    'singapore': 'ap-southeast-1',
    'sydney': 'ap-southeast-2',
    'mumbai': 'ap-south-1',
    'saopaulo': 'sa-east-1',
    'sao-paulo': 'sa-east-1',
    'montreal': 'ca-central-1',
    'toronto': 'ca-central-1',
    'shanghai': 'cn-shanghai',
    'beijing': 'cn-beijing',
    'hangzhou': 'cn-hangzhou',
    'shenzhen': 'cn-shenzhen',
    'hong-kong': 'asia-east2',
    'hongkong': 'asia-east2',
    'taiwan': 'asia-east1',
    'amsterdam': 'ams3',
    'bangalore': 'blr1',
    'cape-town': 'af-south-1',
    'capetown': 'af-south-1',
  }

  for (const [keyword, region] of Object.entries(locationKeywords)) {
    if (name.includes(keyword) || context.includes(keyword)) return region
  }

  // Local clusters
  if (name.includes('kind') || name.includes('minikube') || name.includes('k3d') || name.includes('docker-desktop') || name.includes('rancher-desktop') || name.includes('colima')) {
    return 'local'
  }

  // Check for zone patterns (zone-a, zone-b, etc. often include region prefix)
  const zoneMatch = name.match(/([a-z]{2,}-[a-z]+-\d)[a-z]?/)
  if (zoneMatch && REGION_COORDINATES[zoneMatch[1]]) {
    return zoneMatch[1]
  }

  return null
}

type StatusFilter = 'all' | 'healthy' | 'unhealthy'

export function ClusterLocations({ config: _config }: ClusterLocationsProps) {
  const { t } = useTranslation(['cards', 'common'])
  const { deduplicatedClusters: allClusters, isLoading } = useClusters()
  const { drillToCluster } = useDrillDownActions()

  // Report loading state to CardWrapper for skeleton/refresh behavior
  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading,
    hasAnyData: allClusters.length > 0,
  })

  const {
    selectedClusters: globalSelectedClusters,
    isAllClustersSelected,
    customFilter,
  } = useGlobalFilters()

  // Map SVG state
  const [mapSvg, setMapSvg] = useState<string>('')
  const [mapLoading, setMapLoading] = useState(true)
  const [mapError, setMapError] = useState(false)

  // Fetch SVG content
  useEffect(() => {
    const controller = new AbortController()
    setMapLoading(true)
    setMapError(false)
    
    fetch(WorldMapSvgUrl, { signal: controller.signal })
      .then(res => {
        if (!res.ok) throw new Error('Failed to load map')
        return res.text()
      })
      .then(svg => {
        setMapSvg(svg)
        setMapLoading(false)
      })
      .catch(err => {
        if (err.name !== 'AbortError') {
          console.error('Failed to load world map:', err)
          setMapError(true)
          setMapLoading(false)
        }
      })
    
    return () => controller.abort()
  }, [])

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

  // Hover state
  const [hoveredCluster, setHoveredCluster] = useState<string | null>(null)

  // Apply global filters
  const clusters = useMemo(() => {
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

    // Apply local filters
    if (statusFilter === 'healthy') {
      result = result.filter(c => c.healthy)
    } else if (statusFilter === 'unhealthy') {
      result = result.filter(c => !c.healthy)
    }

    if (searchFilter.trim()) {
      const query = searchFilter.toLowerCase()
      result = result.filter(c =>
        c.name.toLowerCase().includes(query) ||
        c.context?.toLowerCase().includes(query)
      )
    }

    return result
  }, [allClusters, globalSelectedClusters, isAllClustersSelected, customFilter, statusFilter, searchFilter])

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
          coordinates: coords,
        })
      }

      groups.get(region)!.clusters.push(cluster)
    }

    return Array.from(groups.values()).sort((a, b) => b.clusters.length - a.clusters.length)
  }, [clusters])

  // Calculate stats
  const stats = useMemo(() => {
    const healthyClusters = clusters.filter(c => c.healthy).length
    const uniqueRegions = regionGroups.length
    const providers = new Set(regionGroups.map(r => r.provider))
    return { healthyClusters, totalClusters: clusters.length, uniqueRegions, providerCount: providers.size }
  }, [clusters, regionGroups])

  // Map controls
  const handleZoomIn = useCallback(() => {
    setZoom(z => Math.min(z * 1.5, 4))
  }, [])

  const handleZoomOut = useCallback(() => {
    setZoom(z => Math.max(z / 1.5, 0.5))
  }, [])

  const handleReset = useCallback(() => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }, [])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0) {
      setIsPanning(true)
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y })
    }
  }, [pan])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning) {
      setPan({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      })
    }
  }, [isPanning, panStart])

  const handleMouseUp = useCallback(() => {
    setIsPanning(false)
  }, [])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    if (e.deltaY < 0) {
      setZoom(z => Math.min(z * 1.1, 4))
    } else {
      setZoom(z => Math.max(z / 1.1, 0.5))
    }
  }, [])

  if (showSkeleton) {
    return (
      <div className="h-full flex flex-col min-h-card">
        <div className="flex items-center justify-between mb-4">
          <Skeleton variant="text" width={140} height={20} />
          <Skeleton variant="rounded" width={80} height={28} />
        </div>
        <Skeleton variant="rounded" className="flex-1" />
      </div>
    )
  }

  if (showEmptyState) {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground">
        <p className="text-sm">{t('cards:clusterLocations.noClustersAvailable')}</p>
        <p className="text-xs mt-1">{t('cards:clusterLocations.addClustersToSeeLocations')}</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card content-loaded">
      {/* Header */}
      <div className="flex items-center justify-end mb-2">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`p-1.5 rounded-md hover:bg-secondary transition-colors ${showFilters ? 'bg-secondary text-purple-400' : 'text-muted-foreground'}`}
            title={t('cards:clusterLocations.toggleFilters')}
          >
            <Filter className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="mb-2 p-2 bg-secondary/30 rounded-lg border border-border/50 space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder={t('common:common.searchClusters')}
              className="flex-1 px-2 py-1 text-xs bg-secondary rounded border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-purple-500/50"
            />
            {searchFilter && (
              <button onClick={() => setSearchFilter('')} className="text-muted-foreground hover:text-foreground">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{t('common:common.status')}:</span>
            <div className="flex gap-1">
              {(['all', 'healthy', 'unhealthy'] as StatusFilter[]).map((status) => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={`px-2 py-0.5 text-xs rounded transition-colors ${
                    statusFilter === status
                      ? status === 'healthy' ? 'bg-green-500/20 text-green-400'
                        : status === 'unhealthy' ? 'bg-red-500/20 text-red-400'
                        : 'bg-purple-500/20 text-purple-400'
                      : 'bg-secondary text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t(`cards:clusterLocations.status.${status}`)}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="flex items-center gap-3 mb-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <Server className="w-3 h-3" />
          <span>{stats.totalClusters}</span>
        </div>
        <div className="flex items-center gap-1">
          <Globe className="w-3 h-3" />
          <span>{t('cards:clusterLocations.regionCount', { count: stats.uniqueRegions })}</span>
        </div>
        <div className="flex items-center gap-1">
          <Cloud className="w-3 h-3" />
          <span>{stats.providerCount}</span>
        </div>
      </div>

      {/* World Map */}
      <div
        ref={mapRef}
        className="flex-1 relative min-h-[180px] bg-gradient-to-b from-slate-900/50 to-slate-800/30 rounded-lg overflow-hidden cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        {mapLoading ? (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <Globe className="w-8 h-8 mx-auto mb-2 opacity-50 animate-pulse" />
              <p className="text-sm">{t('cards:clusterLocations.loadingMap')}</p>
            </div>
          </div>
        ) : mapError ? (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <Globe className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">{t('cards:clusterLocations.failedToLoadMap')}</p>
            </div>
          </div>
        ) : regionGroups.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <Globe className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">{t('cards:clusterLocations.noClustersFound')}</p>
            </div>
          </div>
        ) : (
          <div
            className="absolute inset-0 transition-transform duration-100"
            style={{
              transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
              transformOrigin: 'center center',
            }}
          >
            {/* SVG Map Background */}
            <div
              className="absolute inset-0 [&_svg]:w-full [&_svg]:h-full [&_rect]:fill-transparent [&_path]:fill-emerald-800/40 [&_path]:stroke-emerald-600/20 [&_path]:stroke-[0.3]"
              dangerouslySetInnerHTML={{ __html: mapSvg }}
            />

            {/* Cluster Markers */}
            {regionGroups.map(group => (
              group.clusters.map((cluster, idx) => {
                const provider = detectCloudProvider(cluster.name, cluster.server, cluster.namespaces)
                const isHovered = hoveredCluster === cluster.name
                // Offset multiple clusters in same region
                const offsetX = (idx % 3) * 2 - 2
                const offsetY = Math.floor(idx / 3) * 2.5

                return (
                  <div
                    key={cluster.name}
                    className="absolute transform -translate-x-1/2 -translate-y-1/2 z-10"
                    style={{
                      left: `${group.coordinates.x + offsetX}%`,
                      top: `${group.coordinates.y + offsetY}%`,
                    }}
                    onMouseEnter={() => setHoveredCluster(cluster.name)}
                    onMouseLeave={() => setHoveredCluster(null)}
                  >
                    {/* Subtle ping animation */}
                    <div
                      className={`absolute inset-0 rounded-full animate-ping opacity-30 ${cluster.healthy ? 'bg-green-400' : 'bg-red-400'}`}
                      style={{
                        animationDuration: '3s',
                        width: 24,
                        height: 24,
                        marginLeft: -4,
                        marginTop: -4,
                      }}
                    />

                    {/* Cluster badge */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        drillToCluster(cluster.name)
                      }}
                      className={`relative flex items-center gap-1 px-1.5 py-0.5 rounded-md border transition-all duration-200 ${
                        isHovered ? 'scale-125 z-20' : ''
                      } ${
                        cluster.healthy
                          ? 'bg-green-500/20 border-green-500/40 hover:bg-green-500/30'
                          : 'bg-red-500/20 border-red-500/40 hover:bg-red-500/30'
                      }`}
                      style={{ fontSize: 8 }}
                    >
                      <CloudProviderIcon provider={provider} size={10} />
                      <span className="text-[9px] font-medium text-foreground max-w-[60px] truncate">
                        {cluster.name.length > 12 ? cluster.name.substring(0, 10) + '…' : cluster.name}
                      </span>
                      <div className={`w-1.5 h-1.5 rounded-full ${cluster.healthy ? 'bg-green-400' : 'bg-red-400'}`} />
                    </button>

                    {/* Hover tooltip */}
                    {isHovered && (
                      <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1 z-50 pointer-events-none">
                        <div className="bg-popover border border-border rounded-lg shadow-xl p-2 min-w-[140px]">
                          <div className="flex items-center gap-1.5 mb-1">
                            <CloudProviderIcon provider={provider} size={14} />
                            <span className="text-xs font-medium text-foreground">{cluster.name}</span>
                          </div>
                          <div className="text-[10px] text-muted-foreground space-y-0.5">
                            <div>{t('cards:clusterLocations.region')}: {group.displayName}</div>
                            <div>{t('common:common.status')}: <span className={cluster.healthy ? 'text-green-400' : 'text-red-400'}>{cluster.healthy ? t('common:common.healthy') : t('common:common.unhealthy')}</span></div>
                            {cluster.context && <div className="truncate">{t('cards:clusterLocations.context')}: {cluster.context}</div>}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })
            ))}
          </div>
        )}

        {/* Map Controls */}
        <div className="absolute top-2 right-2 flex flex-col gap-1 z-20">
          <button
            onClick={handleZoomIn}
            className="p-1 bg-secondary/80 hover:bg-secondary rounded border border-border/50 text-muted-foreground hover:text-foreground transition-colors"
            title={t('cards:clusterLocations.zoomIn')}
          >
            <ZoomIn className="w-3 h-3" />
          </button>
          <button
            onClick={handleZoomOut}
            className="p-1 bg-secondary/80 hover:bg-secondary rounded border border-border/50 text-muted-foreground hover:text-foreground transition-colors"
            title={t('cards:clusterLocations.zoomOut')}
          >
            <ZoomOut className="w-3 h-3" />
          </button>
          <button
            onClick={handleReset}
            className="p-1 bg-secondary/80 hover:bg-secondary rounded border border-border/50 text-muted-foreground hover:text-foreground transition-colors"
            title={t('cards:clusterLocations.resetView')}
          >
            <Maximize2 className="w-3 h-3" />
          </button>
        </div>

        {/* Zoom indicator */}
        {zoom !== 1 && (
          <div className="absolute bottom-2 right-2 text-[10px] text-muted-foreground bg-secondary/80 px-1.5 py-0.5 rounded">
            {Math.round(zoom * 100)}%
          </div>
        )}
      </div>

      {/* Footer - Provider Legend */}
      {regionGroups.length > 0 && (
        <div className="mt-2 pt-2 border-t border-border/50">
          <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
            {Array.from(new Set(regionGroups.flatMap(r => r.clusters.map(c => detectCloudProvider(c.name, c.server, c.namespaces))))).slice(0, 5).map(provider => (
              <div key={provider} className="flex items-center gap-1">
                <CloudProviderIcon provider={provider} size={10} />
                <span className="capitalize">{provider}</span>
              </div>
            ))}
            <div className="flex items-center gap-1 ml-auto">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
              <span>{t('common:common.healthy')}</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
              <span>{t('cards:clusterLocations.issues')}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
