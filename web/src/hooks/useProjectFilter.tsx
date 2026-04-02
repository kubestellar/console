/**
 * Project filter context — lets users scope the entire dashboard to one or
 * more "projects" (named cluster groupings).
 *
 * Provider should wrap the tree above GlobalFiltersProvider so that the
 * global cluster list can be narrowed by the active project selection.
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react'
import {
  ALL_PROJECTS_ID,
  MAX_USER_PROJECTS,
  PROJECTS_STORAGE_KEY,
  SELECTED_PROJECTS_STORAGE_KEY,
  isBuiltInProject,
  getBuiltInProjects,
  type Project,
} from '../lib/projects'

// ---------------------------------------------------------------------------
// Context shape
// ---------------------------------------------------------------------------

interface ProjectFilterContextType {
  /** All available projects (built-in + user-defined) */
  projects: Project[]

  /** IDs of the currently active projects. [ALL_PROJECTS_ID] = no filter */
  selectedProjectIds: string[]

  /** Replace the full selection */
  setSelectedProjectIds: (ids: string[]) => void

  /** Toggle a single project on/off */
  toggleProject: (id: string) => void

  /** True when "All Projects" is the only selection (= no filtering) */
  isAllSelected: boolean

  /** True when any project filter is active (not "All") */
  isProjectFiltered: boolean

  /** Convenience — set of cluster names visible under the current selection */
  visibleClusters: Set<string>

  /** Check if a given cluster name passes the project filter */
  isClusterVisible: (cluster: string) => boolean

  /** Check if a given namespace passes the project filter */
  isNamespaceVisible: (namespace: string) => boolean

  // CRUD for user-defined projects
  addProject: (project: Omit<Project, 'id'>) => void
  updateProject: (id: string, updates: Partial<Omit<Project, 'id'>>) => void
  deleteProject: (id: string) => void
}

const ProjectFilterContext = createContext<ProjectFilterContextType | null>(null)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateProjectId(): string {
  return `proj-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw) return JSON.parse(raw) as T
  } catch {
    // corrupt data — fall through
  }
  return fallback
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function ProjectFilterProvider({ children }: { children: ReactNode }) {
  // ---- user-defined projects (persisted) --------------------------------
  const [userProjects, setUserProjects] = useState<Project[]>(() =>
    loadFromStorage<Project[]>(PROJECTS_STORAGE_KEY, []),
  )

  // ---- selected project IDs (persisted) ---------------------------------
  const [selectedProjectIds, setSelectedProjectIdsState] = useState<string[]>(() =>
    loadFromStorage<string[]>(SELECTED_PROJECTS_STORAGE_KEY, [ALL_PROJECTS_ID]),
  )

  // Persist on change
  useEffect(() => {
    localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(userProjects))
  }, [userProjects])

  useEffect(() => {
    localStorage.setItem(SELECTED_PROJECTS_STORAGE_KEY, JSON.stringify(selectedProjectIds))
  }, [selectedProjectIds])

  // ---- combined list (built-in + user) -----------------------------------
  const projects = useMemo<Project[]>(
    () => [...getBuiltInProjects(), ...userProjects],
    [userProjects],
  )

  // ---- derived booleans ---------------------------------------------------
  const isAllSelected = useMemo(
    () =>
      selectedProjectIds.length === 0 ||
      selectedProjectIds.includes(ALL_PROJECTS_ID),
    [selectedProjectIds],
  )

  const isProjectFiltered = !isAllSelected

  // ---- visible clusters ---------------------------------------------------
  const visibleClusters = useMemo<Set<string>>(() => {
    if (isAllSelected) return new Set<string>() // empty = "show everything"
    const set = new Set<string>()
    for (const id of selectedProjectIds) {
      const proj = projects.find(p => p.id === id)
      if (proj) {
        for (const c of proj.clusters) set.add(c)
      }
    }
    return set
  }, [isAllSelected, selectedProjectIds, projects])

  // ---- visible namespaces -------------------------------------------------
  const visibleNamespaces = useMemo<Set<string>>(() => {
    if (isAllSelected) return new Set<string>()
    const set = new Set<string>()
    for (const id of selectedProjectIds) {
      const proj = projects.find(p => p.id === id)
      if (proj) {
        for (const ns of (proj.namespaces || [])) set.add(ns)
      }
    }
    return set
  }, [isAllSelected, selectedProjectIds, projects])

  // ---- filter helpers -----------------------------------------------------
  const isClusterVisible = useCallback(
    (cluster: string): boolean => {
      if (isAllSelected) return true
      return visibleClusters.has(cluster)
    },
    [isAllSelected, visibleClusters],
  )

  const isNamespaceVisible = useCallback(
    (namespace: string): boolean => {
      if (isAllSelected) return true
      // If no selected project defines namespace filters, all namespaces pass
      if (visibleNamespaces.size === 0) return true
      return visibleNamespaces.has(namespace)
    },
    [isAllSelected, visibleNamespaces],
  )

  // ---- selection actions --------------------------------------------------
  const setSelectedProjectIds = useCallback((ids: string[]) => {
    // If empty or "All" included, normalise to just [ALL_PROJECTS_ID]
    if (ids.length === 0 || ids.includes(ALL_PROJECTS_ID)) {
      setSelectedProjectIdsState([ALL_PROJECTS_ID])
    } else {
      setSelectedProjectIdsState(ids)
    }
  }, [])

  const toggleProject = useCallback(
    (id: string) => {
      if (id === ALL_PROJECTS_ID) {
        // Clicking "All" always resets to show everything
        setSelectedProjectIdsState([ALL_PROJECTS_ID])
        return
      }
      setSelectedProjectIdsState(prev => {
        // If currently "All", switch to just this one project
        if (prev.includes(ALL_PROJECTS_ID) || prev.length === 0) {
          return [id]
        }
        if (prev.includes(id)) {
          const next = prev.filter(p => p !== id)
          // If nothing left, revert to "All"
          return next.length === 0 ? [ALL_PROJECTS_ID] : next
        }
        return [...prev, id]
      })
    },
    [],
  )

  // ---- CRUD ---------------------------------------------------------------
  const addProject = useCallback(
    (project: Omit<Project, 'id'>) => {
      if (userProjects.length >= MAX_USER_PROJECTS) return
      const newProject: Project = { ...project, id: generateProjectId() }
      setUserProjects(prev => [...prev, newProject])
    },
    [userProjects.length],
  )

  const updateProject = useCallback(
    (id: string, updates: Partial<Omit<Project, 'id'>>) => {
      if (isBuiltInProject(id)) return // cannot edit built-ins
      setUserProjects(prev =>
        prev.map(p => (p.id === id ? { ...p, ...updates } : p)),
      )
    },
    [],
  )

  const deleteProject = useCallback(
    (id: string) => {
      if (isBuiltInProject(id)) return
      setUserProjects(prev => prev.filter(p => p.id !== id))
      // If the deleted project was selected, remove it from selection
      setSelectedProjectIdsState(prev => {
        const next = prev.filter(p => p !== id)
        return next.length === 0 ? [ALL_PROJECTS_ID] : next
      })
    },
    [],
  )

  // ---- context value -------------------------------------------------------
  const value = useMemo<ProjectFilterContextType>(
    () => ({
      projects,
      selectedProjectIds,
      setSelectedProjectIds,
      toggleProject,
      isAllSelected,
      isProjectFiltered,
      visibleClusters,
      isClusterVisible,
      isNamespaceVisible,
      addProject,
      updateProject,
      deleteProject,
    }),
    [
      projects,
      selectedProjectIds,
      setSelectedProjectIds,
      toggleProject,
      isAllSelected,
      isProjectFiltered,
      visibleClusters,
      isClusterVisible,
      isNamespaceVisible,
      addProject,
      updateProject,
      deleteProject,
    ],
  )

  return (
    <ProjectFilterContext.Provider value={value}>
      {children}
    </ProjectFilterContext.Provider>
  )
}

// ---------------------------------------------------------------------------
// Consumer hook
// ---------------------------------------------------------------------------

export function useProjectFilter() {
  const ctx = useContext(ProjectFilterContext)
  if (!ctx) {
    throw new Error('useProjectFilter must be used within a ProjectFilterProvider')
  }
  return ctx
}
