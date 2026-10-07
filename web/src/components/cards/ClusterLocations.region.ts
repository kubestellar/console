import type { ClusterInfo } from '../../hooks/useMCP'
import { REGION_COORDINATES } from './ClusterLocations.constants'

// Extract region from cluster info - enhanced with node labels and vendor hints
export function extractRegion(cluster: ClusterInfo): string | null {
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
    'capetown': 'af-south-1' }

  for (const [keyword, region] of Object.entries(locationKeywords)) {
    if (name.includes(keyword) || context.includes(keyword)) return region
  }

  // Local clusters
  if (name.includes('kind') || name.includes('minikube') || name.includes('k3d') || name.includes('docker-desktop') || name.includes('rancher-desktop') || name.includes('colima') || name.includes('vcluster')) {
    return 'local'
  }

  // Check for zone patterns (zone-a, zone-b, etc. often include region prefix)
  const zoneMatch = name.match(/([a-z]{2 }-[a-z]+-\d)[a-z]?/)
  if (zoneMatch && REGION_COORDINATES[zoneMatch[1]]) {
    return zoneMatch[1]
  }

  return null
}
