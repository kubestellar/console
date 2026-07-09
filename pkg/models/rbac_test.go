package models

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestK8sUser_JSONSerialization(t *testing.T) {
	t.Run("full user with namespace", func(t *testing.T) {
		user := K8sUser{
			Kind:      K8sSubjectServiceAccount,
			Name:      "my-sa",
			Namespace: "kube-system",
			Cluster:   "prod-cluster",
		}
		data, err := json.Marshal(user)
		require.NoError(t, err)

		var m map[string]interface{}
		require.NoError(t, json.Unmarshal(data, &m))
		require.Equal(t, "ServiceAccount", m["kind"])
		require.Equal(t, "my-sa", m["name"])
		require.Equal(t, "kube-system", m["namespace"])
		require.Equal(t, "prod-cluster", m["cluster"])
	})

	t.Run("omitempty namespace absent for User kind", func(t *testing.T) {
		user := K8sUser{
			Kind:    K8sSubjectUser,
			Name:    "alice",
			Cluster: "dev",
		}
		data, err := json.Marshal(user)
		require.NoError(t, err)
		require.NotContains(t, string(data), `"namespace"`)
	})

	t.Run("round-trip preserves values", func(t *testing.T) {
		original := K8sUser{
			Kind:      K8sSubjectGroup,
			Name:      "developers",
			Namespace: "",
			Cluster:   "staging",
		}
		data, err := json.Marshal(original)
		require.NoError(t, err)

		var decoded K8sUser
		require.NoError(t, json.Unmarshal(data, &decoded))
		require.Equal(t, original.Kind, decoded.Kind)
		require.Equal(t, original.Name, decoded.Name)
		require.Equal(t, original.Cluster, decoded.Cluster)
	})
}

func TestOpenShiftUser_JSONSerialization(t *testing.T) {
	t.Run("full user with CreatedAt", func(t *testing.T) {
		now := time.Now().UTC().Truncate(time.Second)
		user := OpenShiftUser{
			Name:       "admin",
			FullName:   "Admin User",
			Identities: []string{"github:12345"},
			Groups:     []string{"cluster-admins"},
			Cluster:    "ocp-prod",
			CreatedAt:  &now,
		}
		data, err := json.Marshal(user)
		require.NoError(t, err)

		var decoded OpenShiftUser
		require.NoError(t, json.Unmarshal(data, &decoded))
		require.Equal(t, user.Name, decoded.Name)
		require.Equal(t, user.FullName, decoded.FullName)
		require.Equal(t, user.Identities, decoded.Identities)
		require.Equal(t, user.Groups, decoded.Groups)
		require.NotNil(t, decoded.CreatedAt)
		require.True(t, now.Equal(*decoded.CreatedAt))
	})

	t.Run("nil CreatedAt omitted from JSON", func(t *testing.T) {
		user := OpenShiftUser{
			Name:    "viewer",
			Cluster: "ocp-dev",
		}
		data, err := json.Marshal(user)
		require.NoError(t, err)
		require.NotContains(t, string(data), `"createdAt"`)
	})

	t.Run("empty optional fields omitted", func(t *testing.T) {
		user := OpenShiftUser{
			Name:    "minimal",
			Cluster: "test",
		}
		data, err := json.Marshal(user)
		require.NoError(t, err)
		require.NotContains(t, string(data), `"fullName"`)
		require.NotContains(t, string(data), `"identities"`)
		require.NotContains(t, string(data), `"groups"`)
	})
}

func TestK8sRole_JSONSerialization(t *testing.T) {
	t.Run("ClusterRole serialization", func(t *testing.T) {
		role := K8sRole{
			Name:        "cluster-admin",
			Namespace:   "",
			Cluster:     "prod",
			IsCluster:   true,
			RuleCount:   42,
			Description: "Full cluster admin",
		}
		data, err := json.Marshal(role)
		require.NoError(t, err)

		var m map[string]interface{}
		require.NoError(t, json.Unmarshal(data, &m))
		require.Equal(t, true, m["isCluster"])
		require.Equal(t, float64(42), m["ruleCount"])
		require.NotContains(t, string(data), `"namespace":`)
	})

	t.Run("namespaced Role", func(t *testing.T) {
		role := K8sRole{
			Name:      "pod-reader",
			Namespace: "default",
			Cluster:   "dev",
			IsCluster: false,
			RuleCount: 3,
		}
		data, err := json.Marshal(role)
		require.NoError(t, err)
		require.Contains(t, string(data), `"namespace":"default"`)
		require.Contains(t, string(data), `"isCluster":false`)
	})
}

func TestK8sRoleBinding_JSONSerialization(t *testing.T) {
	binding := K8sRoleBinding{
		Name:      "admin-binding",
		Namespace: "production",
		Cluster:   "prod-cluster",
		IsCluster: false,
		RoleName:  "admin",
		RoleKind:  "ClusterRole",
		Subjects: []struct {
			Kind      K8sSubjectKind `json:"kind"`
			Name      string         `json:"name"`
			Namespace string         `json:"namespace,omitempty"`
		}{
			{Kind: K8sSubjectUser, Name: "alice"},
			{Kind: K8sSubjectServiceAccount, Name: "deployer", Namespace: "ci"},
		},
	}
	data, err := json.Marshal(binding)
	require.NoError(t, err)

	var decoded K8sRoleBinding
	require.NoError(t, json.Unmarshal(data, &decoded))
	require.Equal(t, binding.Name, decoded.Name)
	require.Equal(t, binding.RoleName, decoded.RoleName)
	require.Len(t, decoded.Subjects, 2)
	require.Equal(t, K8sSubjectUser, decoded.Subjects[0].Kind)
	require.Equal(t, "ci", decoded.Subjects[1].Namespace)
}

func TestK8sServiceAccount_JSONSerialization(t *testing.T) {
	t.Run("full service account", func(t *testing.T) {
		now := time.Now().UTC().Truncate(time.Second)
		sa := K8sServiceAccount{
			Name:      "my-app",
			Namespace: "default",
			Cluster:   "prod",
			Secrets:   []string{"my-app-token-abc"},
			Roles:     []string{"pod-reader", "log-viewer"},
			CreatedAt: &now,
		}
		data, err := json.Marshal(sa)
		require.NoError(t, err)

		var decoded K8sServiceAccount
		require.NoError(t, json.Unmarshal(data, &decoded))
		require.Equal(t, sa.Name, decoded.Name)
		require.Equal(t, sa.Secrets, decoded.Secrets)
		require.Equal(t, sa.Roles, decoded.Roles)
		require.NotNil(t, decoded.CreatedAt)
		require.True(t, now.Equal(*decoded.CreatedAt))
	})

	t.Run("nil CreatedAt omitted", func(t *testing.T) {
		sa := K8sServiceAccount{
			Name:      "minimal-sa",
			Namespace: "kube-system",
			Cluster:   "dev",
		}
		data, err := json.Marshal(sa)
		require.NoError(t, err)
		require.NotContains(t, string(data), `"createdAt"`)
		require.NotContains(t, string(data), `"secrets"`)
		require.NotContains(t, string(data), `"roles"`)
	})
}

func TestClusterPermissions_JSONSerialization(t *testing.T) {
	perms := ClusterPermissions{
		Cluster:        "prod",
		IsClusterAdmin: true,
		CanCreateSA:    true,
		CanManageRBAC:  true,
		CanViewSecrets: false,
	}
	data, err := json.Marshal(perms)
	require.NoError(t, err)

	var m map[string]interface{}
	require.NoError(t, json.Unmarshal(data, &m))
	require.Equal(t, "prod", m["cluster"])
	require.Equal(t, true, m["isClusterAdmin"])
	require.Equal(t, true, m["canCreateServiceAccounts"])
	require.Equal(t, true, m["canManageRBAC"])
	require.Equal(t, false, m["canViewSecrets"])
}

func TestUpdateUserRoleRequest_JSONDeserialization(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected UserRole
	}{
		{"admin role", `{"role":"admin"}`, UserRoleAdmin},
		{"editor role", `{"role":"editor"}`, UserRoleEditor},
		{"viewer role", `{"role":"viewer"}`, UserRoleViewer},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var req UpdateUserRoleRequest
			require.NoError(t, json.Unmarshal([]byte(tt.input), &req))
			require.Equal(t, tt.expected, req.Role)
		})
	}
}

func TestCreateServiceAccountRequest_JSONDeserialization(t *testing.T) {
	input := `{"name":"deploy-bot","namespace":"ci-cd","cluster":"prod"}`
	var req CreateServiceAccountRequest
	require.NoError(t, json.Unmarshal([]byte(input), &req))
	require.Equal(t, "deploy-bot", req.Name)
	require.Equal(t, "ci-cd", req.Namespace)
	require.Equal(t, "prod", req.Cluster)
}

func TestCreateRoleBindingRequest_JSONDeserialization(t *testing.T) {
	input := `{
		"name":"viewer-binding",
		"namespace":"production",
		"cluster":"main",
		"isCluster":false,
		"roleName":"view",
		"roleKind":"ClusterRole",
		"subjectKind":"User",
		"subjectName":"bob",
		"subjectNamespace":""
	}`
	var req CreateRoleBindingRequest
	require.NoError(t, json.Unmarshal([]byte(input), &req))
	require.Equal(t, "viewer-binding", req.Name)
	require.Equal(t, "production", req.Namespace)
	require.Equal(t, false, req.IsCluster)
	require.Equal(t, K8sSubjectUser, req.SubjectKind)
	require.Equal(t, "bob", req.SubjectName)
}

func TestAuditLogEntry_JSONSerialization(t *testing.T) {
	id := uuid.New()
	userID := uuid.New()
	now := time.Now().UTC().Truncate(time.Second)

	entry := AuditLogEntry{
		ID:         id,
		UserID:     userID,
		Action:     "create_user",
		TargetType: "console_user",
		TargetID:   "user-123",
		Details:    "Created user via admin panel",
		CreatedAt:  now,
	}
	data, err := json.Marshal(entry)
	require.NoError(t, err)

	var decoded AuditLogEntry
	require.NoError(t, json.Unmarshal(data, &decoded))
	require.Equal(t, id, decoded.ID)
	require.Equal(t, userID, decoded.UserID)
	require.Equal(t, "create_user", decoded.Action)
	require.Equal(t, "console_user", decoded.TargetType)
	require.Equal(t, "Created user via admin panel", decoded.Details)
	require.True(t, now.Equal(decoded.CreatedAt))
}

func TestCanIRequest_JSONDeserialization(t *testing.T) {
	t.Run("full request", func(t *testing.T) {
		input := `{
			"cluster":"prod",
			"verb":"create",
			"resource":"pods",
			"namespace":"default",
			"group":"",
			"subresource":"log",
			"name":"my-pod"
		}`
		var req CanIRequest
		require.NoError(t, json.Unmarshal([]byte(input), &req))
		require.Equal(t, "prod", req.Cluster)
		require.Equal(t, "create", req.Verb)
		require.Equal(t, "pods", req.Resource)
		require.Equal(t, "default", req.Namespace)
		require.Equal(t, "log", req.Subresource)
		require.Equal(t, "my-pod", req.Name)
	})

	t.Run("minimal request omits optional fields", func(t *testing.T) {
		req := CanIRequest{
			Cluster:  "dev",
			Verb:     "list",
			Resource: "namespaces",
		}
		data, err := json.Marshal(req)
		require.NoError(t, err)
		require.NotContains(t, string(data), `"namespace":`)
		require.NotContains(t, string(data), `"subresource":`)
		require.NotContains(t, string(data), `"name":`)
	})
}

func TestCanIResponse_JSONSerialization(t *testing.T) {
	t.Run("allowed", func(t *testing.T) {
		resp := CanIResponse{Allowed: true, Reason: "RBAC: allowed by ClusterRoleBinding"}
		data, err := json.Marshal(resp)
		require.NoError(t, err)
		require.Contains(t, string(data), `"allowed":true`)
		require.Contains(t, string(data), `"reason"`)
	})

	t.Run("denied with omitted reason", func(t *testing.T) {
		resp := CanIResponse{Allowed: false}
		data, err := json.Marshal(resp)
		require.NoError(t, err)
		require.Contains(t, string(data), `"allowed":false`)
		require.NotContains(t, string(data), `"reason"`)
	})
}

func TestUserManagementSummary_JSONSerialization(t *testing.T) {
	summary := UserManagementSummary{}
	summary.ConsoleUsers.Total = 10
	summary.ConsoleUsers.Admins = 2
	summary.ConsoleUsers.Editors = 3
	summary.ConsoleUsers.Viewers = 5
	summary.K8sServiceAccounts.Total = 25
	summary.K8sServiceAccounts.Clusters = []string{"prod", "staging"}
	summary.CurrentUserPermissions = []ClusterPermissions{
		{Cluster: "prod", IsClusterAdmin: true, CanCreateSA: true, CanManageRBAC: true, CanViewSecrets: true},
	}

	data, err := json.Marshal(summary)
	require.NoError(t, err)

	var decoded UserManagementSummary
	require.NoError(t, json.Unmarshal(data, &decoded))
	require.Equal(t, 10, decoded.ConsoleUsers.Total)
	require.Equal(t, 2, decoded.ConsoleUsers.Admins)
	require.Equal(t, []string{"prod", "staging"}, decoded.K8sServiceAccounts.Clusters)
	require.Len(t, decoded.CurrentUserPermissions, 1)
	require.True(t, decoded.CurrentUserPermissions[0].IsClusterAdmin)
}

func TestNamespaceDetails_JSONSerialization(t *testing.T) {
	now := time.Now().UTC().Truncate(time.Second)
	ns := NamespaceDetails{
		Name:    "production",
		Cluster: "prod",
		Status:  "Active",
		Labels:  map[string]string{"env": "prod", "team": "platform"},
		CreatedAt: now,
	}
	data, err := json.Marshal(ns)
	require.NoError(t, err)

	var decoded NamespaceDetails
	require.NoError(t, json.Unmarshal(data, &decoded))
	require.Equal(t, "production", decoded.Name)
	require.Equal(t, "Active", decoded.Status)
	require.Equal(t, "prod", decoded.Labels["env"])
	require.True(t, now.Equal(decoded.CreatedAt))
}

func TestCreateNamespaceRequest_JSONDeserialization(t *testing.T) {
	input := `{"cluster":"prod","name":"my-namespace","labels":{"env":"staging"}}`
	var req CreateNamespaceRequest
	require.NoError(t, json.Unmarshal([]byte(input), &req))
	require.Equal(t, "prod", req.Cluster)
	require.Equal(t, "my-namespace", req.Name)
	require.Equal(t, "staging", req.Labels["env"])
}

func TestGrantNamespaceAccessRequest_JSONDeserialization(t *testing.T) {
	input := `{
		"cluster":"prod",
		"subjectKind":"ServiceAccount",
		"subjectName":"deploy-bot",
		"subjectNamespace":"ci",
		"role":"edit"
	}`
	var req GrantNamespaceAccessRequest
	require.NoError(t, json.Unmarshal([]byte(input), &req))
	require.Equal(t, "ServiceAccount", req.SubjectKind)
	require.Equal(t, "deploy-bot", req.SubjectName)
	require.Equal(t, "ci", req.SubjectNS)
	require.Equal(t, "edit", req.Role)
}

func TestPermissionsSummaryResponse_JSONSerialization(t *testing.T) {
	resp := PermissionsSummaryResponse{
		Clusters: map[string]ClusterPermissionsSummary{
			"prod": {
				IsClusterAdmin:       true,
				CanListNodes:         true,
				CanListNamespaces:    true,
				CanCreateNamespaces:  false,
				CanManageRBAC:        true,
				CanViewSecrets:       false,
				AccessibleNamespaces: []string{"default", "kube-system"},
			},
		},
	}
	data, err := json.Marshal(resp)
	require.NoError(t, err)

	var decoded PermissionsSummaryResponse
	require.NoError(t, json.Unmarshal(data, &decoded))
	require.Contains(t, decoded.Clusters, "prod")
	require.True(t, decoded.Clusters["prod"].IsClusterAdmin)
	require.Equal(t, []string{"default", "kube-system"}, decoded.Clusters["prod"].AccessibleNamespaces)
}

func TestConsoleUserWithRole_JSONSerialization(t *testing.T) {
	user := ConsoleUserWithRole{
		Role: UserRoleEditor,
	}
	user.GitHubLogin = "testuser"
	user.GitHubID = "999"

	data, err := json.Marshal(user)
	require.NoError(t, err)

	var m map[string]interface{}
	require.NoError(t, json.Unmarshal(data, &m))
	require.Equal(t, "editor", m["role"])
	require.Equal(t, "testuser", m["github_login"])
}
