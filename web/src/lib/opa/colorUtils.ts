/**
 * Color utilities for OPA/Gatekeeper policy visualization
 * Provides consistent styling for policy modes and violation severities
 */

/**
 * Get color classes for policy enforcement mode
 * @param mode - Policy enforcement mode
 * @returns Tailwind CSS classes for background and text
 */
export function getModeColor(mode: 'warn' | 'enforce' | 'dryrun' | 'deny'): string {
  switch (mode) {
    case 'enforce':
    case 'deny':
      return 'bg-red-500/20 text-red-400'
    case 'warn':
      return 'bg-yellow-500/20 text-yellow-400'
    case 'dryrun':
      return 'bg-blue-500/20 text-blue-400'
    default:
      return 'bg-gray-500/20 text-gray-400'
  }
}

/**
 * Get color classes for violation severity
 * @param severity - Violation severity level
 * @returns Tailwind CSS classes for background and text
 */
export function getSeverityColor(severity: 'critical' | 'warning' | 'info'): string {
  switch (severity) {
    case 'critical':
      return 'bg-red-500/20 text-red-400'
    case 'warning':
      return 'bg-yellow-500/20 text-yellow-400'
    case 'info':
      return 'bg-blue-500/20 text-blue-400'
    default:
      return 'bg-gray-500/20 text-gray-400'
  }
}
