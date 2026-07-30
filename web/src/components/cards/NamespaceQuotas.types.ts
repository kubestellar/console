export interface NamespaceQuotasProps {
  config?: {
    cluster?: string
    namespace?: string
  }
}

export interface QuotaUsage {
  resource: string
  rawResource: string // Original k8s resource name
  used: string
  limit: string
  percent: number
  cluster?: string
  namespace?: string
  quotaName?: string // The name of the ResourceQuota this came from
}

export interface LimitRangeItem {
  name: string
  type: string
  limits: {
    type: string
    max?: Record<string, string>
    min?: Record<string, string>
    default?: Record<string, string>
    defaultRequest?: Record<string, string>
  }
  cluster?: string
  namespace?: string
}

export interface QuotaDeleteTarget {
  cluster: string
  namespace: string
  name: string
}

export type TabKey = 'quotas' | 'limits'
export type SortByOption = 'name' | 'percent'
