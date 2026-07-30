/**
 * Shared status icon and color mappers for status cards.
 * Eliminates duplication across GatewayStatus, CRDHealth, HelmReleaseStatus, etc.
 */

import { LucideIcon, CheckCircle2, CheckCircle, Clock, XCircle, AlertCircle, AlertTriangle } from 'lucide-react'

export interface StatusColorConfig {
  bg: string
  text: string
  border: string
}

/**
 * Gateway status icon mapper (Programmed | Accepted | Pending | NotAccepted | Unknown)
 */
export const gatewayStatusIcons: Record<string, LucideIcon> = {
  Programmed: CheckCircle2,
  Accepted: CheckCircle2,
  Pending: Clock,
  NotAccepted: XCircle,
  Unknown: Clock,
}

/**
 * Gateway status color mapper
 */
export const gatewayStatusColors: Record<string, StatusColorConfig> = {
  Programmed: { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/20' },
  Accepted: { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/20' },
  Pending: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/20' },
  NotAccepted: { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/20' },
  Unknown: { bg: 'bg-gray-500/20', text: 'text-muted-foreground', border: 'border-gray-500/20' },
}

/**
 * CRD health status icon mapper (Established | NotEstablished | Terminating)
 */
export const crdStatusIcons: Record<string, LucideIcon> = {
  Established: CheckCircle,
  NotEstablished: XCircle,
  Terminating: AlertTriangle,
}

/**
 * CRD health status color mapper (returns simple color names for Tailwind)
 */
export const crdStatusColors: Record<string, string> = {
  Established: 'green',
  NotEstablished: 'red',
  Terminating: 'orange',
}

/**
 * Helm release status icon mapper (Deployed | Superseded | Failed | Pending | Unknown)
 */
export const helmStatusIcons: Record<string, LucideIcon> = {
  Deployed: CheckCircle2,
  Superseded: AlertCircle,
  Failed: XCircle,
  Pending: Clock,
  Unknown: AlertCircle,
}

/**
 * Helm release status color mapper
 */
export const helmStatusColors: Record<string, StatusColorConfig> = {
  Deployed: { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/20' },
  Superseded: { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/20' },
  Failed: { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/20' },
  Pending: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/20' },
  Unknown: { bg: 'bg-gray-500/20', text: 'text-muted-foreground', border: 'border-gray-500/20' },
}

/**
 * Operator status icon mapper (Running | Failed | Unknown | Pending)
 */
export const operatorStatusIcons: Record<string, LucideIcon> = {
  Running: CheckCircle2,
  Failed: XCircle,
  Unknown: AlertCircle,
  Pending: Clock,
}

/**
 * Operator status color mapper
 */
export const operatorStatusColors: Record<string, StatusColorConfig> = {
  Running: { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/20' },
  Failed: { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/20' },
  Unknown: { bg: 'bg-gray-500/20', text: 'text-muted-foreground', border: 'border-gray-500/20' },
  Pending: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/20' },
}

/**
 * Generic status mapper factory: create icon and color mappers for any status type
 * @param iconMap Record of status -> icon
 * @param colorMap Record of status -> color config
 * @param defaultIcon Fallback icon if status not found
 * @param defaultColor Fallback color config if status not found
 */
export function createStatusMappers<T extends string>(
  iconMap: Record<T, LucideIcon>,
  colorMap: Record<T, StatusColorConfig>,
  defaultIcon: LucideIcon = AlertCircle,
  defaultColor: StatusColorConfig = { bg: 'bg-gray-500/20', text: 'text-muted-foreground', border: 'border-gray-500/20' }
) {
  return {
    getIcon: (status: T | string): LucideIcon => iconMap[status as T] ?? defaultIcon,
    getColor: (status: T | string): StatusColorConfig => colorMap[status as T] ?? defaultColor,
  }
}
