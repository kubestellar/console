/**
 * Centralized mapping utilities for Kubernetes resource kinds
 * Provides consistent icons and colors across the application
 */

import { 
  Box, 
  Layers, 
  Server, 
  Network, 
  Briefcase, 
  Activity, 
  Settings, 
  Lock, 
  User, 
  HardDrive 
} from 'lucide-react'

/**
 * Supported Kubernetes resource kinds
 */
export type ResourceKind = 
  | 'Pod' 
  | 'Deployment' 
  | 'Node' 
  | 'Service' 
  | 'Job' 
  | 'HPA' 
  | 'ConfigMap' 
  | 'Secret'
  | 'ServiceAccount'
  | 'PVC'

/**
 * Get the icon component for a given resource kind
 * @param kind - The Kubernetes resource kind
 * @param className - Optional CSS classes for the icon (e.g., "w-4 h-4")
 * @returns JSX element for the icon or null
 */
export function getResourceKindIcon(kind: ResourceKind, className = 'w-3.5 h-3.5') {
  const iconProps = { className }
  
  switch (kind) {
    case 'Pod': 
      return <Box {...iconProps} />
    case 'Deployment': 
      return <Layers {...iconProps} />
    case 'Node': 
      return <Server {...iconProps} />
    case 'Service': 
      return <Network {...iconProps} />
    case 'Job': 
      return <Briefcase {...iconProps} />
    case 'HPA': 
      return <Activity {...iconProps} />
    case 'ConfigMap': 
      return <Settings {...iconProps} />
    case 'Secret': 
      return <Lock {...iconProps} />
    case 'ServiceAccount': 
      return <User {...iconProps} />
    case 'PVC': 
      return <HardDrive {...iconProps} />
    default: 
      return null
  }
}

/**
 * Get the color for a given resource kind (text color only)
 * @param kind - The Kubernetes resource kind
 * @returns Tailwind color class
 */
export function getResourceKindColor(kind: ResourceKind): string {
  switch (kind) {
    case 'Pod': return 'text-blue-400'
    case 'Deployment': return 'text-purple-400'
    case 'Node': return 'text-cyan-400'
    case 'Service': return 'text-cyan-400'
    case 'Job': return 'text-amber-400'
    case 'HPA': return 'text-violet-400'
    case 'ConfigMap': return 'text-orange-400'
    case 'Secret': return 'text-pink-400'
    case 'ServiceAccount': return 'text-teal-400'
    case 'PVC': return 'text-emerald-400'
    default: return 'text-gray-400'
  }
}

/**
 * Get the background and text color classes for a given resource kind
 * @param kind - The Kubernetes resource kind
 * @returns Tailwind CSS classes for background and text
 */
export function getResourceKindColors(kind: ResourceKind): string {
  switch (kind) {
    case 'Pod': return 'bg-blue-500/20 text-blue-400'
    case 'Deployment': return 'bg-purple-500/20 text-purple-400'
    case 'Node': return 'bg-cyan-500/20 text-cyan-400'
    case 'Service': return 'bg-cyan-500/20 text-cyan-400'
    case 'Job': return 'bg-amber-500/20 text-amber-400'
    case 'HPA': return 'bg-violet-500/20 text-violet-400'
    case 'ConfigMap': return 'bg-orange-500/20 text-orange-400'
    case 'Secret': return 'bg-pink-500/20 text-pink-400'
    case 'ServiceAccount': return 'bg-teal-500/20 text-teal-400'
    case 'PVC': return 'bg-emerald-500/20 text-emerald-400'
    default: return 'bg-gray-500/20 text-gray-400'
  }
}

/**
 * Get background and text color classes for a status color name
 * @param color - Color name (e.g., 'green', 'red', 'yellow')
 * @returns Tailwind CSS classes for background and text
 */
export function getStatusBgColor(color: string): string {
  switch (color) {
    case 'green': return 'bg-green-500/20 text-green-400'
    case 'blue': return 'bg-blue-500/20 text-blue-400'
    case 'yellow': return 'bg-yellow-500/20 text-yellow-400'
    case 'red': return 'bg-red-500/20 text-red-400'
    case 'cyan': return 'bg-cyan-500/20 text-cyan-400'
    case 'purple': return 'bg-purple-500/20 text-purple-400'
    case 'orange': return 'bg-orange-500/20 text-orange-400'
    case 'pink': return 'bg-pink-500/20 text-pink-400'
    case 'teal': return 'bg-teal-500/20 text-teal-400'
    case 'emerald': return 'bg-emerald-500/20 text-emerald-400'
    case 'violet': return 'bg-violet-500/20 text-violet-400'
    case 'amber': return 'bg-amber-500/20 text-amber-400'
    default: return 'bg-gray-500/20 text-gray-400'
  }
}
