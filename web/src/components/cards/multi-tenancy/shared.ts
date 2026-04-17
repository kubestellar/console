/**
 * Shared types, constants, and mission prompts for Multi-Tenancy dashboard cards.
 *
 * All four technology cards (OVN, KubeFlex, K3s, KubeVirt) share these definitions
 * for consistent health reporting, isolation tracking, and cache configuration.
 */

// ============================================================================
// Shared Types
// ============================================================================

/** Overall component health across the cluster */
export type ComponentHealth = 'healthy' | 'degraded' | 'not-installed' | 'unknown'

/** Describes one axis of tenant isolation provided by a technology */
export interface IsolationLevel {
  /** The isolation plane this entry covers */
  type: 'control-plane' | 'data-plane' | 'network'
  /** Current readiness of this isolation capability */
  status: 'ready' | 'missing' | 'degraded'
  /** Technology that provides this isolation (e.g. "OVN-Kubernetes", "KubeVirt") */
  provider: string
}

// ============================================================================
// Cache Keys
// ============================================================================

/** Cache key for OVN-Kubernetes status card */
export const OVN_CACHE_KEY = 'ovn-status'

/** Cache key for KubeFlex status card */
export const KUBEFLEX_CACHE_KEY = 'kubeflex-status'

/** Cache key for K3s status card */
export const K3S_CACHE_KEY = 'k3s-status'

/** Cache key for KubeVirt status card */
export const KUBEVIRT_CACHE_KEY = 'kubevirt-status'

// ============================================================================
// Refresh Category
// ============================================================================

/**
 * All multi-tenancy cards use the 'operators' refresh category (300s interval).
 * These are infrastructure-level components that change infrequently.
 */
export const OPERATOR_REFRESH_CATEGORY = 'operators' as const

/** Alias used by spec — points to same refresh category */
export const MT_REFRESH_CATEGORY = OPERATOR_REFRESH_CATEGORY

// ============================================================================
// Pod Detection Label Selectors
// ============================================================================

/** OVN-Kubernetes infrastructure pod app-label values */
export const OVN_LABELS = ['ovnkube-node', 'ovnkube-master', 'ovnkube-controller'] as const

/** KubeFlex controller labels used for detection */
export const KUBEFLEX_LABELS = { name: 'kubeflex', app: 'kubeflex-controller' } as const

/** KubeVirt component app-label values */
export const KUBEVIRT_LABELS = ['virt-operator', 'virt-controller', 'virt-handler', 'virt-api'] as const

/** Container image substring identifying a K3s binary */
export const K3S_IMAGE_PATTERN = 'rancher/k3s' as const

// ============================================================================
// AI Mission Install Prompts
// ============================================================================

/** Mission prompt for installing OVN-Kubernetes with UDN support */
export const OVN_INSTALL_PROMPT =
  'Install OVN-Kubernetes with User Defined Network (UDN) support on this cluster. ' +
  'OVN-Kubernetes provides advanced networking with Layer 2/3 tenant isolation. ' +
  'Follow the official OVN-Kubernetes installation guide and configure UDN support for multi-tenancy. ' +
  'After installation, ask: "OVN is ready — move on?" or "Something went wrong — want to see details?"'

/** Mission prompt for installing KubeFlex */
export const KUBEFLEX_INSTALL_PROMPT =
  'Install KubeFlex from the KubeStellar project to provide dedicated control planes per tenant. ' +
  'KubeFlex enables scalable multi-tenant Kubernetes control plane management. ' +
  'Use the official KubeFlex Helm chart or kubectl apply method. ' +
  'After installation, ask: "KubeFlex is ready — move on?" or "Something went wrong — want to see details?"'

/** Mission prompt for deploying K3s as nested clusters */
export const K3S_INSTALL_PROMPT =
  'Deploy K3s lightweight Kubernetes as pods for multi-tenant control planes. ' +
  'K3s provides a certified Kubernetes distribution in a single binary, ideal for nested clusters ' +
  'within KubeVirt VMs or as standalone tenant control planes. ' +
  'After deployment, ask: "K3s is ready — move on?" or "Something went wrong — want to see details?"'

/** Mission prompt for installing KubeVirt */
export const KUBEVIRT_INSTALL_PROMPT =
  'Install KubeVirt to run virtual machines as Kubernetes pods for data-plane tenant isolation. ' +
  'Deploy the KubeVirt operator and configure VM support. ' +
  'KubeVirt provides a cost-effective alternative to physical node isolation for multi-tenancy. ' +
  'After installation, ask: "KubeVirt is ready — move on?" or "Something went wrong — want to see details?"'
