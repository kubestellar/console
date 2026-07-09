package models

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestUserRole_StringValues(t *testing.T) {
	require.Equal(t, "admin", string(UserRoleAdmin))
	require.Equal(t, "editor", string(UserRoleEditor))
	require.Equal(t, "viewer", string(UserRoleViewer))
}

func TestUserRole_JSONSerialization(t *testing.T) {
	tests := []struct {
		name string
		role UserRole
		json string
	}{
		{"admin role", UserRoleAdmin, `"admin"`},
		{"editor role", UserRoleEditor, `"editor"`},
		{"viewer role", UserRoleViewer, `"viewer"`},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			data, err := json.Marshal(tt.role)
			require.NoError(t, err)
			require.JSONEq(t, tt.json, string(data))

			var decoded UserRole
			require.NoError(t, json.Unmarshal(data, &decoded))
			require.Equal(t, tt.role, decoded)
		})
	}
}

func TestConsoleUserWithRole_JSONSerialization(t *testing.T) {
	userID := uuid.New()
	user := ConsoleUserWithRole{
		User: User{
			ID:          userID,
			GitHubLogin: "testuser",
			Email:       "test@example.com",
		},
		Role: UserRoleEditor,
	}

	data, err := json.Marshal(user)
	require.NoError(t, err)

	var decoded ConsoleUserWithRole
	require.NoError(t, json.Unmarshal(data, &decoded))
	require.Equal(t, userID, decoded.ID)
	require.Equal(t, "testuser", decoded.GitHubLogin)
	require.Equal(t, "test@example.com", decoded.Email)
	require.Equal(t, UserRoleEditor, decoded.Role)
}

func TestK8sSubjectKind_StringValues(t *testing.T) {
	require.Equal(t, "User", string(K8sSubjectUser))
	require.Equal(t, "Group", string(K8sSubjectGroup))
	require.Equal(t, "ServiceAccount", string(K8sSubjectServiceAccount))
}

func TestK8sUser_JSONSerialization(t *testing.T) {
	t.Run("user subject", func(t *testing.T) {
		user := K8sUser{
			Kind:    K8sSubjectUser,
			Name:    "alice",
			Cluster: "prod-cluster",
		}

		data, err := json.Marshal(user)
		require.NoError(t, err)

		var decoded K8sUser
		require.NoError(t, json.Unmarshal(data, &decoded))
		require.Equal(t, K8sSubjectUser, decoded.Kind)
		require.Equal(t, "alice", decoded.Name)
		require.Equal(t, "prod-cluster", decoded.Cluster)
		require.Empty(t, decoded.Namespace)
	})

	t.Run("service account with namespace", func(t *testing.T) {
		sa := K8sUser{
			Kind:      K8sSubjectServiceAccount,
			Name:      "build-bot",
			Namespace: "ci",
			Cluster:   "dev-cluster",
		}

		data, err := json.Marshal(sa)
		require.NoError(t, err)

		var decoded K8sUser
		require.NoError(t, json.Unmarshal(data, &decoded))
		require.Equal(t, K8sSubjectServiceAccount, decoded.Kind)
		require.Equal(t, "build-bot", decoded.Name)
		require.Equal(t, "ci", decoded.Namespace)
		require.Equal(t, "dev-cluster", decoded.Cluster)
	})
}

func TestOpenShiftUser_JSONSerialization(t *testing.T) {
	t.Run("full user with createdAt", func(t *testing.T) {
		now := time.Now()
		user := OpenShiftUser{
			Name:       "developer",
			FullName:   "Developer User",
			Identities: []string{"github:12345", "ldap:dev"},
			Groups:     []string{"developers", "admins"},
			Cluster:    "openshift-prod",
			CreatedAt:  &now,
		}

		data, err := json.Marshal(user)
		require.NoError(t, err)

		var decoded OpenShiftUser
		require.NoError(t, json.Unmarshal(data, &decoded))
		require.Equal(t, "developer", decoded.Name)
		require.Equal(t, "Developer User", decoded.FullName)
		require.Equal(t, []string{"github:12345", "ldap:dev"}, decoded.Identities)
		require.Equal(t, []string{"developers", "admins"}, decoded.Groups)
		require.Equal(t, "openshift-prod", decoded.Cluster)
		require.NotNil(t, decoded.CreatedAt)
		require.True(t, decoded.CreatedAt.Equal(now))
	})

	t.Run("nil createdAt is omitted", func(t *testing.T) {
		user := OpenShiftUser{
			Name:    "guest",
			Cluster: "test-cluster",
		}

		data, err := json.Marshal(user)
		require.NoError(t, err)
		require.NotContains(t, string(data), "createdAt")

		var decoded OpenShiftUser
		require.NoError(t, json.Unmarshal(data, &decoded))
		require.Equal(t, "guest", decoded.Name)
		require.Nil(t, decoded.CreatedAt)
	})
}

func TestK8sRole_JSONSerialization(t *testing.T) {
	t.Run("cluster role", func(t *testing.T) {
		role := K8sRole{
			Name:        "cluster-admin",
			Cluster:     "prod",
			IsCluster:   true,
			RuleCount:   42,
			Description: "Full cluster access",
		}

		data, err := json.Marshal(role)
		require.NoError(t, err)

		var decoded K8sRole
		require.NoError(t, json.Unmarshal(data, &decoded))
		require.Equal(t, "cluster-admin", decoded.Name)
		require.Empty(t, decoded.Namespace)
		require.True(t, decoded.IsCluster)
		require.Equal(t, 42, decoded.RuleCount)
		require.Equal(t, "Full cluster access", decoded.Description)
	})

	t.Run("namespaced role", func(t *testing.T) {
		role := K8sRole{
			Name:      "developer",
			Namespace: "apps",
			Cluster:   "dev",
			IsCluster: false,
			RuleCount: 8,
		}

		data, err := json.Marshal(role)
		require.NoError(t, err)

		var decoded K8sRole
		require.NoError(t, json.Unmarshal(data, &decoded))
		require.Equal(t, "developer", decoded.Name)
		require.Equal(t, "apps", decoded.Namespace)
		require.False(t, decoded.IsCluster)
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
	}
	binding.Subjects = []struct {
		Kind      K8sSubjectKind `json:"kind"`
		Name      string         `json:"name"`
		Namespace string         `json:"namespace,omitempty"`
	}{
		{Kind: K8sSubjectUser, Name: "alice"},
		{Kind: K8sSubjectServiceAccount, Name: "deployer", Namespace: "ci"},
	}

	data, err := json.Marshal(binding)
	require.NoError(t, err)

	var decoded K8sRoleBinding
	require.NoError(t, json.Unmarshal(data, &decoded))
	require.Equal(t, "admin-binding", decoded.Name)
	require.Equal(t, 2, len(decoded.Subjects))
	require.Equal(t, K8sSubjectUser, decoded.Subjects[0].Kind)
	require.Equal(t, "alice", decoded.Subjects[0].Name)
	require.Equal(t, K8sSubjectServiceAccount, decoded.Subjects[1].Kind)
	require.Equal(t, "deployer", decoded.Subjects[1].Name)
	require.Equal(t, "ci", decoded.Subjects[1].Namespace)
}

func TestK8sServiceAccount_JSONSerialization(t *testing.T) {
	t.Run("with createdAt and roles", func(t *testing.T) {
		now := time.Now()
		sa := K8sServiceAccount{
			Name:      "build-sa",
			Namespace: "ci",
			Cluster:   "dev",
			Secrets:   []string{"build-token-abc", "build-token-xyz"},
			Roles:     []string{"editor", "deployer"},
			CreatedAt: &now,
		}

		data, err := json.Marshal(sa)
		require.NoError(t, err)

		var decoded K8sServiceAccount
		require.NoError(t, json.Unmarshal(data, &decoded))
		require.Equal(t, "build-sa", decoded.Name)
		require.Equal(t, "ci", decoded.Namespace)
		require.Equal(t, 2, len(decoded.Secrets))
		require.Equal(t, 2, len(decoded.Roles))
		require.NotNil(t, decoded.CreatedAt)
	})

	t.Run("nil createdAt is omitted", func(t *testing.T) {
		sa := K8sServiceAccount{
			Name:      "default",
			Namespace: "kube-system",
			Cluster:   "prod",
		}

		data, err := json.Marshal(sa)
		require.NoError(t, err)
		require.NotContains(t, string(data), "createdAt")
	})
}

func TestClusterPermissions_JSONSerialization(t *testing.T) {
	perms := ClusterPermissions{
		Cluster:        "test-cluster",
		IsClusterAdmin: true,
		CanCreateSA:    true,
		CanManageRBAC:  true,
		CanViewSecrets: false,
	}

	data, err := json.Marshal(perms)
	require.NoError(t, err)

	var decoded ClusterPermissions
	require.NoError(t, json.Unmarshal(data, &decoded))
	require.Equal(t, "test-cluster", decoded.Cluster)
	require.True(t, decoded.IsClusterAdmin)
	require.True(t, decoded.CanCreateSA)
	require.True(t, decoded.CanManageRBAC)
	require.False(t, decoded.CanViewSecrets)
}

func TestUserManagementSummary_JSONSerialization(t *testing.T) {
	summary := UserManagementSummary{
		ConsoleUsers: struct {
			Total   int `json:"total"`
			Admins  int `json:"admins"`
			Editors int `json:"editors"`
			Viewers int `json:"viewers"`
		}{
			Total:   15,
			Admins:  2,
			Editors: 8,
			Viewers: 5,
		},
		K8sServiceAccounts: struct {
			Total    int      `json:"total"`
			Clusters []string `json:"clusters"`
		}{
			Total:    42,
			Clusters: []string{"prod", "dev", "staging"},
		},
		CurrentUserPermissions: []ClusterPermissions{
			{Cluster: "prod", IsClusterAdmin: false, CanCreateSA: true},
			{Cluster: "dev", IsClusterAdmin: true, CanManageRBAC: true},
		},
	}

	data, err := json.Marshal(summary)
	require.NoError(t, err)

	var decoded UserManagementSummary
	require.NoError(t, json.Unmarshal(data, &decoded))
	require.Equal(t, 15, decoded.ConsoleUsers.Total)
	require.Equal(t, 2, decoded.ConsoleUsers.Admins)
	require.Equal(t, 3, len(decoded.K8sServiceAccounts.Clusters))
	require.Equal(t, 2, len(decoded.CurrentUserPermissions))
}

func TestUpdateUserRoleRequest_JSONSerialization(t *testing.T) {
	req := UpdateUserRoleRequest{Role: UserRoleAdmin}

	data, err := json.Marshal(req)
	require.NoError(t, err)

	var decoded UpdateUserRoleRequest
	require.NoError(t, json.Unmarshal(data, &decoded))
	require.Equal(t, UserRoleAdmin, decoded.Role)
}

func TestCreateServiceAccountRequest_JSONSerialization(t *testing.T) {
	req := CreateServiceAccountRequest{
		Name:      "test-sa",
		Namespace: "default",
		Cluster:   "prod",
	}

	data, err := json.Marshal(req)
	require.NoError(t, err)

	var decoded CreateServiceAccountRequest
	require.NoError(t, json.Unmarshal(data, &decoded))
	require.Equal(t, "test-sa", decoded.Name)
	require.Equal(t, "default", decoded.Namespace)
	require.Equal(t, "prod", decoded.Cluster)
}

func TestCreateRoleBindingRequest_JSONSerialization(t *testing.T) {
	t.Run("cluster role binding", func(t *testing.T) {
		req := CreateRoleBindingRequest{
			Name:        "admin-binding",
			Cluster:     "prod",
			IsCluster:   true,
			RoleName:    "cluster-admin",
			RoleKind:    "ClusterRole",
			SubjectKind: K8sSubjectUser,
			SubjectName: "alice",
		}

		data, err := json.Marshal(req)
		require.NoError(t, err)

		var decoded CreateRoleBindingRequest
		require.NoError(t, json.Unmarshal(data, &decoded))
		require.True(t, decoded.IsCluster)
		require.Empty(t, decoded.Namespace)
		require.Equal(t, "alice", decoded.SubjectName)
	})

	t.Run("namespaced binding with service account", func(t *testing.T) {
		req := CreateRoleBindingRequest{
			Name:        "deployer-binding",
			Namespace:   "ci",
			Cluster:     "dev",
			IsCluster:   false,
			RoleName:    "edit",
			RoleKind:    "ClusterRole",
			SubjectKind: K8sSubjectServiceAccount,
			SubjectName: "deployer",
			SubjectNS:   "ci",
		}

		data, err := json.Marshal(req)
		require.NoError(t, err)

		var decoded CreateRoleBindingRequest
		require.NoError(t, json.Unmarshal(data, &decoded))
		require.False(t, decoded.IsCluster)
		require.Equal(t, "ci", decoded.Namespace)
		require.Equal(t, K8sSubjectServiceAccount, decoded.SubjectKind)
		require.Equal(t, "ci", decoded.SubjectNS)
	})
}

func TestAuditLogEntry_JSONSerialization(t *testing.T) {
	id := uuid.New()
	userID := uuid.New()
	now := time.Now()

	entry := AuditLogEntry{
		ID:         id,
		UserID:     userID,
		Action:     "create_user",
		TargetType: "console_user",
		TargetID:   "user-123",
		Details:    "Created admin user alice",
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
	require.Equal(t, "user-123", decoded.TargetID)
	require.Equal(t, "Created admin user alice", decoded.Details)
}

func TestCanIRequest_JSONSerialization(t *testing.T) {
	t.Run("simple resource check", func(t *testing.T) {
		req := CanIRequest{
			Cluster:  "prod",
			Verb:     "get",
			Resource: "pods",
		}

		data, err := json.Marshal(req)
		require.NoError(t, err)

		var decoded CanIRequest
		require.NoError(t, json.Unmarshal(data, &decoded))
		require.Equal(t, "prod", decoded.Cluster)
		require.Equal(t, "get", decoded.Verb)
		require.Equal(t, "pods", decoded.Resource)
	})

	t.Run("namespaced resource with subresource", func(t *testing.T) {
		req := CanIRequest{
			Cluster:     "dev",
			Verb:        "create",
			Resource:    "pods",
			Namespace:   "default",
			Group:       "",
			Subresource: "exec",
			Name:        "nginx-pod",
		}

		data, err := json.Marshal(req)
		require.NoError(t, err)

		var decoded CanIRequest
		require.NoError(t, json.Unmarshal(data, &decoded))
		require.Equal(t, "default", decoded.Namespace)
		require.Equal(t, "exec", decoded.Subresource)
		require.Equal(t, "nginx-pod", decoded.Name)
	})
}

func TestCanIResponse_JSONSerialization(t *testing.T) {
	t.Run("allowed", func(t *testing.T) {
		resp := CanIResponse{
			Allowed: true,
			Reason:  "",
		}

		data, err := json.Marshal(resp)
		require.NoError(t, err)

		var decoded CanIResponse
		require.NoError(t, json.Unmarshal(data, &decoded))
		require.True(t, decoded.Allowed)
		require.Empty(t, decoded.Reason)
	})

	t.Run("denied with reason", func(t *testing.T) {
		resp := CanIResponse{
			Allowed: false,
			Reason:  "forbidden by cluster policy",
		}

		data, err := json.Marshal(resp)
		require.NoError(t, err)

		var decoded CanIResponse
		require.NoError(t, json.Unmarshal(data, &decoded))
		require.False(t, decoded.Allowed)
		require.Equal(t, "forbidden by cluster policy", decoded.Reason)
	})
}

func TestClusterPermissionsSummary_JSONSerialization(t *testing.T) {
	summary := ClusterPermissionsSummary{
		IsClusterAdmin:       true,
		CanListNodes:         true,
		CanListNamespaces:    true,
		CanCreateNamespaces:  true,
		CanManageRBAC:        true,
		CanViewSecrets:       false,
		AccessibleNamespaces: []string{"default", "kube-system", "prod"},
	}

	data, err := json.Marshal(summary)
	require.NoError(t, err)

	var decoded ClusterPermissionsSummary
	require.NoError(t, json.Unmarshal(data, &decoded))
	require.True(t, decoded.IsClusterAdmin)
	require.False(t, decoded.CanViewSecrets)
	require.Equal(t, 3, len(decoded.AccessibleNamespaces))
}

func TestPermissionsSummaryResponse_JSONSerialization(t *testing.T) {
	resp := PermissionsSummaryResponse{
		Clusters: map[string]ClusterPermissionsSummary{
			"prod": {
				IsClusterAdmin:    false,
				CanListNodes:      true,
				CanListNamespaces: true,
			},
			"dev": {
				IsClusterAdmin: true,
				CanManageRBAC:  true,
			},
		},
	}

	data, err := json.Marshal(resp)
	require.NoError(t, err)

	var decoded PermissionsSummaryResponse
	require.NoError(t, json.Unmarshal(data, &decoded))
	require.Equal(t, 2, len(decoded.Clusters))
	require.False(t, decoded.Clusters["prod"].IsClusterAdmin)
	require.True(t, decoded.Clusters["dev"].IsClusterAdmin)
}

func TestNamespaceDetails_JSONSerialization(t *testing.T) {
	now := time.Now()
	ns := NamespaceDetails{
		Name:    "production",
		Cluster: "prod-cluster",
		Status:  "Active",
		Labels: map[string]string{
			"env":  "prod",
			"team": "platform",
		},
		CreatedAt: now,
	}

	data, err := json.Marshal(ns)
	require.NoError(t, err)

	var decoded NamespaceDetails
	require.NoError(t, json.Unmarshal(data, &decoded))
	require.Equal(t, "production", decoded.Name)
	require.Equal(t, "prod-cluster", decoded.Cluster)
	require.Equal(t, "Active", decoded.Status)
	require.Equal(t, 2, len(decoded.Labels))
	require.Equal(t, "prod", decoded.Labels["env"])
}

func TestCreateNamespaceRequest_JSONSerialization(t *testing.T) {
	req := CreateNamespaceRequest{
		Cluster: "dev",
		Name:    "new-namespace",
		Labels: map[string]string{
			"created-by": "console",
			"env":        "test",
		},
	}

	data, err := json.Marshal(req)
	require.NoError(t, err)

	var decoded CreateNamespaceRequest
	require.NoError(t, json.Unmarshal(data, &decoded))
	require.Equal(t, "dev", decoded.Cluster)
	require.Equal(t, "new-namespace", decoded.Name)
	require.Equal(t, 2, len(decoded.Labels))
}

func TestGrantNamespaceAccessRequest_JSONSerialization(t *testing.T) {
	t.Run("user access", func(t *testing.T) {
		req := GrantNamespaceAccessRequest{
			Cluster:     "prod",
			SubjectKind: "User",
			SubjectName: "alice",
			Role:        "admin",
		}

		data, err := json.Marshal(req)
		require.NoError(t, err)

		var decoded GrantNamespaceAccessRequest
		require.NoError(t, json.Unmarshal(data, &decoded))
		require.Equal(t, "User", decoded.SubjectKind)
		require.Equal(t, "alice", decoded.SubjectName)
		require.Empty(t, decoded.SubjectNS)
	})

	t.Run("service account access", func(t *testing.T) {
		req := GrantNamespaceAccessRequest{
			Cluster:     "dev",
			SubjectKind: "ServiceAccount",
			SubjectName: "deployer",
			SubjectNS:   "ci",
			Role:        "edit",
		}

		data, err := json.Marshal(req)
		require.NoError(t, err)

		var decoded GrantNamespaceAccessRequest
		require.NoError(t, json.Unmarshal(data, &decoded))
		require.Equal(t, "ServiceAccount", decoded.SubjectKind)
		require.Equal(t, "ci", decoded.SubjectNS)
	})
}

func TestNamespaceAccessEntry_JSONSerialization(t *testing.T) {
	entry := NamespaceAccessEntry{
		BindingName: "admin-binding",
		SubjectKind: "User",
		SubjectName: "alice",
		RoleName:    "cluster-admin",
		RoleKind:    "ClusterRole",
	}

	data, err := json.Marshal(entry)
	require.NoError(t, err)

	var decoded NamespaceAccessEntry
	require.NoError(t, json.Unmarshal(data, &decoded))
	require.Equal(t, "admin-binding", decoded.BindingName)
	require.Equal(t, "User", decoded.SubjectKind)
	require.Equal(t, "alice", decoded.SubjectName)
}

func TestRBACTypes_EmptySlicesSerializeAsJSON(t *testing.T) {
	t.Run("OpenShiftUser empty slices", func(t *testing.T) {
		user := OpenShiftUser{
			Name:       "test",
			Cluster:    "c1",
			Identities: []string{},
			Groups:     []string{},
		}

		data, err := json.Marshal(user)
		require.NoError(t, err)
		require.Contains(t, string(data), `"identities":[]`)
		require.Contains(t, string(data), `"groups":[]`)
	})

	t.Run("K8sServiceAccount empty slices", func(t *testing.T) {
		sa := K8sServiceAccount{
			Name:      "test-sa",
			Namespace: "default",
			Cluster:   "c1",
			Secrets:   []string{},
			Roles:     []string{},
		}

		data, err := json.Marshal(sa)
		require.NoError(t, err)
		require.Contains(t, string(data), `"secrets":[]`)
		require.Contains(t, string(data), `"roles":[]`)
	})
}

func TestRBACTypes_BoundaryConditions(t *testing.T) {
	t.Run("empty role name", func(t *testing.T) {
		role := K8sRole{
			Name:      "",
			Cluster:   "test",
			IsCluster: true,
		}

		data, err := json.Marshal(role)
		require.NoError(t, err)
		require.Contains(t, string(data), `"name":""`)
	})

	t.Run("zero rule count", func(t *testing.T) {
		role := K8sRole{
			Name:      "test",
			Cluster:   "c1",
			RuleCount: 0,
		}

		data, err := json.Marshal(role)
		require.NoError(t, err)
		require.Contains(t, string(data), `"ruleCount":0`)
	})

	t.Run("empty permission summary", func(t *testing.T) {
		perms := ClusterPermissions{
			Cluster: "test",
		}

		data, err := json.Marshal(perms)
		require.NoError(t, err)

		var decoded ClusterPermissions
		require.NoError(t, json.Unmarshal(data, &decoded))
		require.False(t, decoded.IsClusterAdmin)
		require.False(t, decoded.CanCreateSA)
		require.False(t, decoded.CanManageRBAC)
		require.False(t, decoded.CanViewSecrets)
	})
}
