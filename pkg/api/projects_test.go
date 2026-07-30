package api

import "testing"

// TestGetProjectDashboards_KnownProject lives in buildinfo_test.go (PR #17363).
// The additional cases below cover edge cases not in that test.

func TestGetProjectDashboards_UnknownProject(t *testing.T) {
dashboards := getProjectDashboards("nonexistent-project")
if dashboards != nil {
t.Errorf("expected nil for unknown project, got %v", dashboards)
}
}

func TestGetProjectDashboards_EmptyString(t *testing.T) {
dashboards := getProjectDashboards("")
if dashboards != nil {
t.Errorf("expected nil for empty project name, got %v", dashboards)
}
}

func TestIsProjectEnabled(t *testing.T) {
tests := []struct {
name          string
activeProject string
project       string
want          bool
}{
{
name:          "wildcard always matches",
activeProject: "kubestellar",
project:       "*",
want:          true,
},
{
name:          "wildcard matches empty active project",
activeProject: "",
project:       "*",
want:          true,
},
{
name:          "exact match",
activeProject: "kubestellar",
project:       "kubestellar",
want:          true,
},
{
name:          "mismatch",
activeProject: "kubestellar",
project:       "other-project",
want:          false,
},
{
name:          "empty active project with non-wildcard",
activeProject: "",
project:       "kubestellar",
want:          false,
},
{
name:          "both empty matches",
activeProject: "",
project:       "",
want:          true,
},
{
name:          "case sensitive mismatch",
activeProject: "KubeStellar",
project:       "kubestellar",
want:          false,
},
}

for _, tt := range tests {
t.Run(tt.name, func(t *testing.T) {
got := isProjectEnabled(tt.activeProject, tt.project)
if got != tt.want {
t.Errorf("isProjectEnabled(%q, %q) = %v, want %v",
tt.activeProject, tt.project, got, tt.want)
}
})
}
}
