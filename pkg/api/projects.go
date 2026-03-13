package api

// projectDashboardPresets maps project IDs to their default dashboard lists.
// When CONSOLE_PROJECT is set but ENABLED_DASHBOARDS is empty, the preset
// for the active project determines which dashboards appear in the sidebar.
//
// Projects not listed here get all dashboards (no filtering).
var projectDashboardPresets = map[string][]string{
	"kubestellar": {
		"dashboard", "clusters", "cluster-admin", "compliance", "deploy",
		"insights", "ai-ml", "ai-agents", "ci-cd", "alerts", "arcade",
		"llm-d-benchmarks", "gpu-reservations",
		"compute", "security", "storage", "network", "events",
		"workloads", "operators", "nodes", "deployments", "pods",
		"services", "helm", "logs", "data-compliance", "cost",
		"gitops", "gpu",
	},
}

// getProjectDashboards returns the default dashboard list for a project.
// Returns nil if the project has no preset (show all dashboards).
func getProjectDashboards(project string) []string {
	if dashboards, ok := projectDashboardPresets[project]; ok {
		return dashboards
	}
	return nil
}

// isProjectEnabled checks if a given project tag matches the active project.
func isProjectEnabled(activeProject, project string) bool {
	if project == "*" {
		return true
	}
	return project == activeProject
}
