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

const HEALTHY_STYLE: CRDConditionStyle = { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/30', icon: CheckCircle }
const FAILING_STYLE: CRDConditionStyle = { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30', icon: XCircle }
const UNKNOWN_STYLE: CRDConditionStyle = { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/30', icon: AlertTriangle }

/**
 * CRD condition types whose `True` status signals a problem (abnormal-true
 * polarity), unlike Established/NamesAccepted where `True` is healthy.
 */
const ABNORMAL_TRUE_CONDITION_TYPES = new Set(['NonStructuralSchema', 'Terminating'])

/**
 * CRD condition styles. Pass the condition `type` so abnormal-true conditions
 * (e.g. NonStructuralSchema=True) render as failing instead of healthy.
 */
export const getConditionStyle = (status: string, type?: string): CRDConditionStyle => {
  const lower = status?.toLowerCase() || ''
  const isAbnormalTrue = type !== undefined && ABNORMAL_TRUE_CONDITION_TYPES.has(type)
  if (lower === 'true' || lower === 'established') {
    return isAbnormalTrue ? FAILING_STYLE : HEALTHY_STYLE
  }
  if (lower === 'false' || lower === 'failed') {
    return isAbnormalTrue ? HEALTHY_STYLE : FAILING_STYLE
  }
  return UNKNOWN_STYLE
}
