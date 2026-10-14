/**
 * Shared types for the mission-suggestion system.
 *
 * Lives outside hooks/useMissionSuggestions.ts so that other hooks (e.g.
 * useSnoozedMissions) can depend on the shape without creating an import
 * cycle back into useMissionSuggestions.ts.
 */

export type MissionType =
  | 'scale'           // Workloads that may need scaling
  | 'limits'          // Pods without resource limits
  | 'restart'         // Pods with high restart counts
  | 'unavailable'     // Deployments with unavailable replicas
  | 'security'        // Security issues to address
  | 'health'          // Cluster health issues
  | 'resource'        // Resource pressure (nodes at capacity)

export interface MissionSuggestion {
  id: string
  type: MissionType
  title: string
  description: string
  priority: 'critical' | 'high' | 'medium' | 'low'
  action: {
    type: 'ai' | 'navigate' | 'scale' | 'diagnose'
    target: string   // AI command, route, or action identifier
    label: string    // Button label
  }
  context: {
    cluster?: string
    namespace?: string
    resource?: string
    resourceType?: string
    count?: number
    details?: string[]
  }
  detectedAt: number  // timestamp
}
