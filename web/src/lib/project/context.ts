/**
 * Project Context Module
 *
 * Manages the active project context for white-label deployments.
 * The project determines which cards, dashboards, and features are visible.
 *
 * Set once at startup from the /health endpoint response.
 * Cards/dashboards tagged with a project are only shown when that project is active.
 * Cards/dashboards without a projects field (or tagged ['*']) are always visible.
 */

/** Wildcard project tag — cards/dashboards with this are visible to all projects */
const UNIVERSAL_PROJECT = '*'

/** Default project when CONSOLE_PROJECT is not configured */
const DEFAULT_PROJECT = 'kubestellar'

/** Active project context, loaded from /health endpoint at startup */
let activeProject: string = DEFAULT_PROJECT

/** Set the active project (called once from fetchEnabledDashboards) */
export function setActiveProject(project: string): void {
  activeProject = project || DEFAULT_PROJECT
}

/** Get the current active project */
export function getActiveProject(): string {
  return activeProject
}

/**
 * Check if an item is visible for the current (or specified) project.
 *
 * Visibility rules:
 * - No projects field or empty array → universal (always visible)
 * - Contains '*' → universal (always visible)
 * - Contains the active project → visible
 * - Otherwise → hidden
 */
export function isVisibleForProject(
  projects: string[] | undefined,
  project?: string,
): boolean {
  const p = project ?? activeProject
  // No projects field = universal (backward compatible)
  if (!projects || projects.length === 0) return true
  // Wildcard = universal
  if (projects.includes(UNIVERSAL_PROJECT)) return true
  // Check if active project matches
  return projects.includes(p)
}
