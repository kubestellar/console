import { CheckCircle, XCircle, AlertTriangle } from 'lucide-react'

export type TabType = 'overview' | 'versions' | 'instances' | 'schema' | 'ai'

export interface CRDVersion {
  name: string
  served: boolean
  storage: boolean
  deprecated?: boolean
  deprecationWarning?: string
}

export interface CRDVersionRaw {
  name: string
  served: boolean
  storage: boolean
  deprecated?: boolean
  deprecationWarning?: string
  schema?: { openAPIV3Schema?: Record<string, unknown> }
}

export interface CRDInstance {
  name: string
  namespace?: string
  creationTimestamp?: string
}

export interface CRDInstanceRaw {
  metadata?: {
    name?: string
    namespace?: string
    creationTimestamp?: string
  }
}

export interface CRDCondition {
  type: string
  status: string
  reason?: string
  message?: string
  lastTransitionTime?: string
}

export interface CRDConditionRaw {
  type: string
  status: string
  reason?: string
  message?: string
  lastTransitionTime?: string
}

export interface CRDConditionStyle {
  bg: string
  text: string
  border: string
  icon: typeof CheckCircle
}

// CRD condition styles
export const getConditionStyle = (status: string): CRDConditionStyle => {
  const lower = status?.toLowerCase() || ''
  if (lower === 'true' || lower === 'established') {
    return { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/30', icon: CheckCircle }
  }
  if (lower === 'false' || lower === 'failed') {
    return { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30', icon: XCircle }
  }
  return { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/30', icon: AlertTriangle }
}
