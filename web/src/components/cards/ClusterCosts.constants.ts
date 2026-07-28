// Provider detection, pricing tables and shared types for the ClusterCosts card.
// Extracted from ClusterCosts.tsx (issue #21615) — values unchanged.
import { commonComparators } from '../../lib/cards/cardHooks'
import { type CloudProvider as IconProvider } from '../ui/CloudProviderIcon'
import { safeGetJSON } from '../../lib/utils/localStorage'

export type CloudProvider = 'estimate' | 'aws' | 'gcp' | 'azure' | 'oci' | 'openshift'

// Map ClusterCosts provider type to CloudProviderIcon provider type
export const mapProviderToIconProvider = (provider: CloudProvider): IconProvider => {
  switch (provider) {
    case 'aws': return 'eks'
    case 'gcp': return 'gke'
    case 'azure': return 'aks'
    case 'openshift': return 'openshift'
    case 'oci': return 'oci'
    case 'estimate':
    default:
      return 'kubernetes'
  }
}

// LocalStorage key for persisting provider overrides (moved outside component)
export const PROVIDER_OVERRIDES_KEY = 'kubestellar-cluster-provider-overrides'

// Load persisted overrides from localStorage (moved outside component)
export const loadPersistedOverrides = (configOverrides?: Record<string, CloudProvider>): Record<string, CloudProvider> => {
  if (typeof window === 'undefined') return configOverrides || {}
  return safeGetJSON<Record<string, CloudProvider>>(PROVIDER_OVERRIDES_KEY) || configOverrides || {}
}
export type PricingMode = 'uniform' | 'per-cluster'
export type SortByOption = 'cost' | 'name' | 'cpus'
export type SortTranslationKey = 'cards:clusterCosts.sortCost' | 'cards:clusterCosts.sortName' | 'cards:clusterCosts.sortCPUs'

// Labels are set at render time via t() — see getSortOptions()
export const SORT_OPTIONS_KEYS: ReadonlyArray<{ value: SortByOption; labelKey: SortTranslationKey }> = [
  { value: 'cost' as const, labelKey: 'cards:clusterCosts.sortCost' },
  { value: 'name' as const, labelKey: 'cards:clusterCosts.sortName' },
  { value: 'cpus' as const, labelKey: 'cards:clusterCosts.sortCPUs' },
]

// Cloud provider icons (simple text badges for now, could be SVG logos)
export const PROVIDER_ICONS: Record<CloudProvider, { color: string; bg: string; short: string }> = {
  estimate: { color: 'text-muted-foreground', bg: 'bg-gray-500/20 dark:bg-gray-400/15', short: 'EST' },
  aws: { color: 'text-orange-400', bg: 'bg-orange-500/20', short: 'AWS' },
  gcp: { color: 'text-blue-400', bg: 'bg-blue-500/20', short: 'GCP' },
  azure: { color: 'text-blue-400', bg: 'bg-blue-500/20', short: 'AZR' },
  oci: { color: 'text-red-400', bg: 'bg-red-500/20', short: 'OCI' },
  openshift: { color: 'text-red-500', bg: 'bg-red-600/20', short: 'OCP' } }

export interface CloudPricing {
  name: string
  cpu: number      // per vCPU per hour
  memory: number   // per GB per hour
  gpu: number      // per NVIDIA GPU per hour (rough average)
  pricingUrl: string
  notes: string
}

// Cloud provider pricing (approximate, varies by region and instance type)
// These are ballpark figures for reference - actual costs depend on instance types, commitments, etc.
export const CLOUD_PRICING: Record<CloudProvider, CloudPricing> = {
  estimate: {
    name: 'Estimate',
    cpu: 0.05,
    memory: 0.01,
    gpu: 2.50,
    pricingUrl: '',
    notes: 'Generic estimates for rough cost calculation' },
  aws: {
    name: 'AWS',
    cpu: 0.048,      // Based on m5.large ($0.096/hr for 2 vCPU)
    memory: 0.012,   // Based on m5.large pricing
    gpu: 3.06,       // Based on p3.2xlarge (V100)
    pricingUrl: 'https://aws.amazon.com/ec2/pricing/on-demand/',
    notes: 'Based on US East on-demand pricing' },
  gcp: {
    name: 'GCP',
    cpu: 0.0475,     // n2-standard pricing
    memory: 0.0064,  // n2-standard pricing
    gpu: 2.48,       // NVIDIA V100
    pricingUrl: 'https://cloud.google.com/compute/pricing',
    notes: 'Based on us-central1 on-demand pricing' },
  azure: {
    name: 'Azure',
    cpu: 0.05,       // D-series pricing
    memory: 0.011,   // D-series pricing
    gpu: 2.07,       // NC6 (K80) pricing
    pricingUrl: 'https://azure.microsoft.com/en-us/pricing/details/virtual-machines/',
    notes: 'Based on East US on-demand pricing' },
  oci: {
    name: 'OCI',
    cpu: 0.025,      // VM.Standard.E4.Flex
    memory: 0.0015,  // VM.Standard.E4.Flex
    gpu: 2.95,       // GPU.A10
    pricingUrl: 'https://www.oracle.com/cloud/price-list/',
    notes: 'Based on Flex shapes pricing' },
  openshift: {
    name: 'OpenShift',
    cpu: 0.048,      // Based on ROSA (Red Hat OpenShift on AWS) pricing
    memory: 0.012,   // Based on ROSA pricing
    gpu: 3.00,       // GPU node pricing estimate
    pricingUrl: 'https://www.redhat.com/en/technologies/cloud-computing/openshift/aws/pricing',
    notes: 'Based on Red Hat OpenShift on AWS (ROSA) pricing' } }

export interface ClusterCostsProps {
  config?: {
    cpuCostPerHour?: number
    memoryCostPerGBHour?: number
    gpuCostPerHour?: number
    provider?: CloudProvider
    pricingMode?: PricingMode
    /** Per-cluster provider overrides: { clusterName: provider } */
    clusterProviders?: Record<string, CloudProvider>
  }
}

// Known cluster name to provider mappings (for clusters without provider keywords in name)
export const KNOWN_CLUSTER_PROVIDERS: Record<string, CloudProvider> = {
  'prow': 'oci',  // Prow CI cluster runs on OCI
}

/** Detect cloud provider from a single cluster name/context */
export function detectClusterProvider(name: string, context?: string): CloudProvider {
  const searchStr = `${name} ${context || ''}`.toLowerCase()
  const clusterName = name.toLowerCase()

  // Check known cluster mappings first
  if (KNOWN_CLUSTER_PROVIDERS[clusterName]) {
    return KNOWN_CLUSTER_PROVIDERS[clusterName]
  }

  // OpenShift detection (check before other providers as OCP can run on any cloud)
  if (searchStr.includes('openshift') || searchStr.includes('ocp') || searchStr.includes('rosa') || searchStr.includes('aro')) return 'openshift'

  // Cloud provider detection
  if (searchStr.includes('eks') || searchStr.includes('aws') || searchStr.includes('amazon')) return 'aws'
  if (searchStr.includes('gke') || searchStr.includes('gcp') || searchStr.includes('google')) return 'gcp'
  if (searchStr.includes('aks') || searchStr.includes('azure') || searchStr.includes('microsoft')) return 'azure'
  if (searchStr.includes('oke') || searchStr.includes('oci') || searchStr.includes('oracle')) return 'oci'

  return 'estimate'
}

/** Computed cost data for a single cluster */
export interface ClusterCostItem {
  cluster: string   // matches name; used by global filterByCluster
  name: string
  healthy: boolean
  cpus: number
  memory: number
  gpus: number
  hourly: number
  daily: number
  monthly: number
  provider: CloudProvider
  context?: string
}

export const SORT_COMPARATORS = {
  cost: commonComparators.number<ClusterCostItem>('monthly'),
  name: commonComparators.string<ClusterCostItem>('name'),
  cpus: commonComparators.number<ClusterCostItem>('cpus') }
