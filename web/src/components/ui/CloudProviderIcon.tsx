// Cloud provider icons as SVG components
import React from 'react'
import { useTranslation } from 'react-i18next'
import { hostnameEndsWith } from '../../lib/utils/urlHostname'
import {
  AWSIcon,
  GCPIcon,
  AzureIcon,
  OpenShiftIcon,
  OCIIcon,
  AlibabaIcon,
  DigitalOceanIcon,
  RancherIcon,
  CoreWeaveIcon,
  KindIcon,
  MinikubeIcon,
  K3sIcon,
  KubernetesIcon,
} from './CloudProviderIcon.icons'

export type CloudProvider = 'eks' | 'gke' | 'aks' | 'openshift' | 'oci' | 'alibaba' | 'digitalocean' | 'rancher' | 'coreweave' | 'kind' | 'minikube' | 'k3s' | 'kubernetes'

interface CloudProviderIconProps {
  provider: CloudProvider
  size?: number
  className?: string
}

export function CloudProviderIcon({ provider, size = 16, className }: CloudProviderIconProps) {
  const iconProps = { size, className }
  const label = getProviderLabel(provider)

  let icon: React.ReactElement
  switch (provider) {
    case 'eks':
      icon = <AWSIcon {...iconProps} />; break
    case 'gke':
      icon = <GCPIcon {...iconProps} />; break
    case 'aks':
      icon = <AzureIcon {...iconProps} />; break
    case 'openshift':
      icon = <OpenShiftIcon {...iconProps} />; break
    case 'oci':
      icon = <OCIIcon {...iconProps} />; break
    case 'alibaba':
      icon = <AlibabaIcon {...iconProps} />; break
    case 'digitalocean':
      icon = <DigitalOceanIcon {...iconProps} />; break
    case 'rancher':
      icon = <RancherIcon {...iconProps} />; break
    case 'coreweave':
      icon = <CoreWeaveIcon {...iconProps} />; break
    case 'kind':
      icon = <KindIcon {...iconProps} />; break
    case 'minikube':
      icon = <MinikubeIcon {...iconProps} />; break
    case 'k3s':
      icon = <K3sIcon {...iconProps} />; break
    case 'kubernetes':
    default:
      icon = <KubernetesIcon {...iconProps} />; break
  }

  return <span role="img" aria-label={label}>{icon}</span>
}

export function getProviderLabel(provider: CloudProvider): string {
  switch (provider) {
    case 'eks': return 'AWS EKS'
    case 'gke': return 'Google GKE'
    case 'aks': return 'Azure AKS'
    case 'openshift': return 'OpenShift'
    case 'oci': return 'Oracle OKE'
    case 'alibaba': return 'Alibaba ACK'
    case 'digitalocean': return 'DigitalOcean'
    case 'rancher': return 'Rancher'
    case 'coreweave': return 'CoreWeave'
    case 'kind': return 'Kind'
    case 'minikube': return 'Minikube'
    case 'k3s': return 'K3s'
    default: return 'Kubernetes'
  }
}

// Hook to get translated provider label
export function useProviderLabel(provider: CloudProvider): string {
  const { t } = useTranslation('common')

  switch (provider) {
    case 'eks': return t('cloudProviders.awsEks')
    case 'gke': return t('cloudProviders.googleGke')
    case 'aks': return t('cloudProviders.azureAks')
    case 'openshift': return t('cloudProviders.openshift')
    case 'oci': return t('cloudProviders.oracleOke')
    case 'alibaba': return t('cloudProviders.alibabaAck')
    case 'digitalocean': return t('cloudProviders.digitalocean')
    case 'rancher': return t('cloudProviders.rancher')
    case 'coreweave': return t('cloudProviders.coreweave')
    case 'kind': return t('cloudProviders.kind')
    case 'minikube': return t('cloudProviders.minikube')
    case 'k3s': return t('cloudProviders.k3s')
    default: return t('cloudProviders.kubernetes')
  }
}

// Get the primary brand color for each provider (for borders, accents, etc.)
export function getProviderColor(provider: CloudProvider): string {
  switch (provider) {
    case 'eks': return 'var(--provider-eks)'
    case 'gke': return 'var(--provider-gke)'
    case 'aks': return 'var(--provider-aks)'
    case 'openshift': return 'var(--provider-openshift)'
    case 'oci': return 'var(--provider-oci)'
    case 'alibaba': return 'var(--provider-alibaba)'
    case 'digitalocean': return 'var(--provider-digitalocean)'
    case 'rancher': return 'var(--provider-rancher)'
    case 'coreweave': return 'var(--provider-coreweave)'
    case 'kind': return 'var(--provider-kind)'
    case 'minikube': return 'var(--provider-kubernetes)'
    case 'k3s': return 'var(--provider-k3s)'
    default: return 'var(--provider-kubernetes)'
  }
}

// Get Tailwind border class for provider (for use in className)
export function getProviderBorderClass(provider: CloudProvider): string {
  switch (provider) {
    case 'eks': return 'border-blue-500/40'
    case 'gke': return 'border-blue-500/40'
    case 'aks': return 'border-purple-500/40'
    case 'openshift': return 'border-red-500/40'
    case 'oci': return 'border-red-600/40'
    case 'alibaba': return 'border-orange-500/40'
    case 'digitalocean': return 'border-blue-400/40'
    case 'rancher': return 'border-blue-600/40'
    case 'coreweave': return 'border-blue-600/40'
    case 'kind': return 'border-blue-400/40'
    case 'minikube': return 'border-blue-500/40'
    case 'k3s': return 'border-yellow-500/40'
    default: return 'border-blue-500/40'
  }
}

// Get console URL for cloud providers
// Canonical implementation — all components should import from here.
export function getConsoleUrl(provider: CloudProvider | string, clusterName: string, apiServerUrl?: string): string | null {
  const serverUrl = apiServerUrl?.toLowerCase() || ''

  switch (provider) {
    case 'eks': {
      const urlRegionMatch = serverUrl.match(/\.([a-z]{2}-[a-z]+-\d)\.eks\.amazonaws\.com/)
      const nameRegionMatch = clusterName.match(/(us|eu|ap|sa|ca|me|af)-(north|south|east|west|central|northeast|southeast)-\d/)
      const region = urlRegionMatch?.[1] || nameRegionMatch?.[0] || 'us-east-1'
      const shortName = clusterName.split('/').pop() || clusterName
      return `https://${region}.console.aws.amazon.com/eks/home?region=${region}#/clusters/${shortName}`
    }
    case 'gke': {
      const gkeMatch = clusterName.match(/gke_([^_]+)_([^_]+)_(.+)/)
      if (gkeMatch) {
        const [, project, location, gkeName] = gkeMatch
        return `https://console.cloud.google.com/kubernetes/clusters/details/${location}/${gkeName}?project=${project}`
      }
      return 'https://console.cloud.google.com/kubernetes/list/overview'
    }
    case 'aks':
      return 'https://portal.azure.com/#view/HubsExtension/BrowseResource/resourceType/Microsoft.ContainerService%2FmanagedClusters'
    case 'openshift': {
      const apiMatch = apiServerUrl?.match(/(?:https?:\/\/)?api\.([^:/]+)/)
      if (apiMatch) {
        return `https://console-openshift-console.apps.${apiMatch[1]}`
      }
      return null
    }
    case 'oci': {
      const regionMatch = serverUrl.match(/\.([a-z]+-[a-z]+-\d)\.clusters\.oci/)
      const region = regionMatch?.[1] || 'us-ashburn-1'
      return `https://cloud.oracle.com/containers/clusters?region=${region}`
    }
    case 'alibaba':
      return 'https://cs.console.aliyun.com/#/k8s/cluster/list'
    case 'digitalocean':
      return 'https://cloud.digitalocean.com/kubernetes/clusters'
    case 'coreweave':
      return 'https://cloud.coreweave.com/kubernetes'
    default:
      return null
  }
}

// Provider detection from cluster name, API server URL, user, and optionally namespaces
// Priority: 1. Namespace-based (most accurate), 2. Name-based, 3. User-based, 4. URL-based
export function detectCloudProvider(
  clusterName: string,
  apiServerUrl?: string,
  namespaces?: string[],
  userName?: string
): CloudProvider {
  const name = clusterName.toLowerCase()
  const user = userName?.toLowerCase() || ''

  // Check namespace-based patterns FIRST (most accurate when available)
  if (namespaces && namespaces.length > 0) {
    const nsLower = namespaces.map(ns => ns.toLowerCase())

    // OpenShift - has openshift-* namespaces
    if (nsLower.some(ns => ns.startsWith('openshift-') || ns === 'openshift')) {
      return 'openshift'
    }
    // EKS - has aws-observability or amazon-* namespaces
    if (nsLower.some(ns => ns.startsWith('aws-') || ns.startsWith('amazon-') || ns === 'amazon-cloudwatch')) {
      return 'eks'
    }
    // GKE - has gke-* or config-management-system namespaces
    if (nsLower.some(ns => ns.startsWith('gke-') || ns === 'config-management-system' || ns === 'gke-managed-filestorecsi')) {
      return 'gke'
    }
    // AKS - has azure-* namespaces or kube-node-lease with azure annotations
    if (nsLower.some(ns => ns.startsWith('azure-') || ns === 'azure-arc')) {
      return 'aks'
    }
    // OCI - has oci-* or oraclecloud-* namespaces
    if (nsLower.some(ns => ns.startsWith('oci-') || ns.startsWith('oraclecloud-'))) {
      return 'oci'
    }
    // Rancher - has cattle-system or rancher namespaces
    if (nsLower.some(ns => ns === 'cattle-system' || ns === 'cattle-fleet-system' || ns.startsWith('cattle-'))) {
      return 'rancher'
    }
    // K3s - has k3s-system namespace
    if (nsLower.some(ns => ns === 'k3s-system')) {
      return 'k3s'
    }
  }

  // Check name-based patterns (second priority)
  // Oracle OCI OKE - check name first since "oci" in name is definitive
  if (name.includes('oci') || name.includes('oke') || name.includes('oracle')) {
    return 'oci'
  }
  // AWS EKS by name
  if (name.includes('eks') || name.includes('aws') || name.match(/arn:aws:/)) {
    return 'eks'
  }
  // Google GKE by name
  if (name.includes('gke') || name.includes('gcp') || name.includes('google')) {
    return 'gke'
  }
  // Azure AKS by name
  if (name.includes('aks') || name.includes('azure')) {
    return 'aks'
  }
  // OpenShift by name (explicit indicators)
  if (name.includes('openshift') || name.includes('ocp') || name.includes('rosa')) {
    return 'openshift'
  }
  // Alibaba Cloud ACK by name
  if (name.includes('alibaba') || name.includes('aliyun') || name.includes('ack')) {
    return 'alibaba'
  }
  // DigitalOcean by name
  if (name.includes('digitalocean') || name.includes('do-') || name.includes('doks')) {
    return 'digitalocean'
  }
  // CoreWeave by name
  if (name.includes('coreweave')) return 'coreweave'
  // Rancher by name
  if (name.includes('rancher')) return 'rancher'
  // Local development clusters by name
  if (name.includes('kind')) return 'kind'
  if (name.includes('minikube')) return 'minikube'
  if (name.includes('k3s') || name.includes('k3d')) return 'k3s'

  // Check URL-based patterns (fallback for when name doesn't help).
  // Use parsed-hostname checks (not substring matching) to prevent bypass via
  // crafted URLs like evil.com/path?q=eks.amazonaws.com (CodeQL #9119).
  // apiServerUrl is the raw value (not lowercased) — hostnameEndsWith handles case.
  const rawUrl = apiServerUrl || ''
  // AWS EKS by URL
  if (hostnameEndsWith(rawUrl, 'eks.amazonaws.com')) {
    return 'eks'
  }
  // Google GKE by URL
  if (hostnameEndsWith(rawUrl, 'container.googleapis.com') || hostnameEndsWith(rawUrl, 'container.cloud.google.com') || hostnameEndsWith(rawUrl, 'gke.io')) {
    return 'gke'
  }
  // Azure AKS by URL
  if (hostnameEndsWith(rawUrl, 'azmk8s.io')) {
    return 'aks'
  }
  // Oracle OCI by URL
  if (hostnameEndsWith(rawUrl, 'oraclecloud.com')) {
    return 'oci'
  }
  // Alibaba Cloud by URL
  if (hostnameEndsWith(rawUrl, 'aliyuncs.com')) {
    return 'alibaba'
  }
  // DigitalOcean by URL
  if (hostnameEndsWith(rawUrl, 'digitalocean.com') || hostnameEndsWith(rawUrl, 'k8s.ondigitalocean.com')) {
    return 'digitalocean'
  }
  // CoreWeave by URL
  if (hostnameEndsWith(rawUrl, 'coreweave.com')) {
    return 'coreweave'
  }
  // OpenShift by URL - check for specific OpenShift domains (NOT just :6443 port)
  if (hostnameEndsWith(rawUrl, 'openshift.com') || hostnameEndsWith(rawUrl, 'openshiftapps.com')) {
    return 'openshift'
  }

  // Check user-based patterns (OKE generates user names like "user-chbezebxx3a")
  // OKE user pattern: user-[lowercase_alphanumeric_10-12_chars]
  if (user.match(/^user-[a-z0-9]{10,12}$/)) {
    return 'oci'
  }

  return 'kubernetes'
}
