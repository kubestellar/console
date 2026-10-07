import type { ClusterInfo } from '../../hooks/useMCP'
import type { CloudProvider } from '../ui/CloudProviderIcon'

/** Search input debounce delay (#6213). */
export const SEARCH_DEBOUNCE_MS = 250

/** Cluster name display threshold before truncation */
export const MAX_CLUSTER_NAME_DISPLAY = 12
/** Length to truncate cluster names to when they exceed the display threshold */
export const TRUNCATED_NAME_LENGTH = 10

/** Ping animation style for healthy/unhealthy cluster indicators */
export const PING_ANIMATION_STYLE = { animationDuration: '3s', width: 24, height: 24, marginLeft: -4, marginTop: -4 } as const

// Region coordinates on the map (x, y as percentage)
export const REGION_COORDINATES: Record<string, { x: number; y: number; label: string }> = {
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
  'unknown': { x: 50, y: 85, label: 'Unknown' } }

export interface RegionInfo {
  region: string
  displayName: string
  provider: CloudProvider
  clusters: ClusterInfo[]
  coordinates: { x: number; y: number; label: string }
}

export type StatusFilter = 'all' | 'healthy' | 'unhealthy'
