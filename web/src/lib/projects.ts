/**
 * Project definitions for multi-project selection.
 *
 * A "project" groups clusters (and optionally namespaces) so users can scope
 * the dashboard to a subset of their infrastructure.  Projects are persisted
 * in localStorage and surfaced via the useProjectFilter context.
 */

/** Built-in project ID that represents "all clusters, no filtering" */
export const ALL_PROJECTS_ID = '__all__'

/** Built-in project ID for clusters not assigned to any user project */
export const DEFAULT_PROJECT_ID = '__default__'

/** Minimum length for a user-defined project name */
export const PROJECT_NAME_MIN_LENGTH = 1

/** Maximum number of user-defined projects (excludes built-ins) */
export const MAX_USER_PROJECTS = 50

/**
 * A project groups a set of clusters (and optionally namespaces) under a
 * user-chosen name.  The console uses these to filter every dashboard card.
 */
export interface Project {
  /** Unique identifier (auto-generated for user projects) */
  id: string
  /** Human-readable display name */
  name: string
  /** Cluster names that belong to this project */
  clusters: string[]
  /** Optional namespace filter — empty means all namespaces */
  namespaces: string[]
  /** Optional label selector for dynamic cluster matching */
  labels?: Record<string, string>
  /** Badge colour shown in the project selector */
  color?: string
}

/** Returns the two built-in projects (All, Default) */
export function getBuiltInProjects(): Project[] {
  return [
    {
      id: ALL_PROJECTS_ID,
      name: 'All Projects',
      clusters: [],
      namespaces: [],
    },
    {
      id: DEFAULT_PROJECT_ID,
      name: 'Default',
      clusters: [],
      namespaces: [],
    },
  ]
}

/** localStorage key for persisted project definitions */
export const PROJECTS_STORAGE_KEY = 'projects:definitions'

/** localStorage key for the currently selected project IDs */
export const SELECTED_PROJECTS_STORAGE_KEY = 'projects:selected'

/** Type guard — true for the two built-in IDs */
export function isBuiltInProject(id: string): boolean {
  return id === ALL_PROJECTS_ID || id === DEFAULT_PROJECT_ID
}
