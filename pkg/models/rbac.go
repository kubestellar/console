package models

import (
	"time"

	"github.com/google/uuid"
)

// UserRole represents a console user's role
type UserRole string

const (
	UserRoleAdmin  UserRole = "admin"
	UserRoleEditor UserRole = "editor"
	UserRoleViewer UserRole = "viewer"
)

// ConsoleUserWithRole extends User with role information
type ConsoleUserWithRole struct {
	User
	Role UserRole `json:"role"`
}

// K8sSubjectKind represents the kind of Kubernetes subject
type K8sSubjectKind string

const (
	K8sSubjectUser           K8sSubjectKind = "User"
	K8sSubjectGroup          K8sSubjectKind = "Group"
	K8sSubjectServiceAccount K8sSubjectKind = "ServiceAccount"
)

// K8sUser represents a Kubernetes user/subject
type K8sUser struct {
	Kind      K8sSubjectKind `json:"kind"`
	Name      string         `json:"name"`
	Namespace string         `json:"namespace,omitempty"` // Only for ServiceAccounts
	Cluster   string         `json:"cluster"`
}

// OpenShiftUser represents an OpenShift user (users.user.openshift.io)
type OpenShiftUser struct {
	Name       string   `json:"name"`
	FullName   string   `json:"fullName,omitempty"`
	Identities []string `json:"identities,omitempty"`
	Groups     []string `json:"groups,omitempty"`
	Cluster    string   `json:"cluster"`
	CreatedAt  string   `json:"createdAt,omitempty"`
}

// K8sRole represents a Kubernetes Role or ClusterRole
type K8sRole struct {
	Name        string `json:"name"`
	Namespace   string `json:"namespace,omitempty"` // Empty for ClusterRole
	Cluster     string `json:"cluster"`
	IsCluster   bool   `json:"isCluster"` // true for ClusterRole
	RuleCount   int    `json:"ruleCount"`
	Description string `json:"description,omitempty"`
}

// K8sRoleBinding represents a Kubernetes RoleBinding or ClusterRoleBinding
type K8sRoleBinding struct {
	Name      string `json:"name"`
	Namespace string `json:"namespace,omitempty"` // Empty for ClusterRoleBinding
	Cluster   string `json:"cluster"`
	IsCluster bool   `json:"isCluster"` // true for ClusterRoleBinding
	RoleName  string `json:"roleName"`
	RoleKind  string `json:"roleKind"` // Role or ClusterRole
	Subjects  []struct {
		Kind      K8sSubjectKind `json:"kind"`
		Name      string         `json:"name"`
		Namespace string         `json:"namespace,omitempty"`
	} `json:"subjects"`
}

// K8sServiceAccount represents a Kubernetes ServiceAccount with its bindings
type K8sServiceAccount struct {
	Name      string   `json:"name"`
	Namespace string   `json:"namespace"`
	Cluster   string   `json:"cluster"`
	Secrets   []string `json:"secrets,omitempty"`
	Roles     []string `json:"roles,omitempty"`
	CreatedAt string   `json:"createdAt,omitempty"`
}

// ClusterPermissions represents current user's permissions on a cluster
type ClusterPermissions struct {
	Cluster        string `json:"cluster"`
	IsClusterAdmin bool   `json:"isClusterAdmin"`
	CanCreateSA    bool   `json:"canCreateServiceAccounts"`
	CanManageRBAC  bool   `json:"canManageRBAC"`
	CanViewSecrets bool   `json:"canViewSecrets"`
}

// UserManagementSummary provides an overview of users across console and k8s
type UserManagementSummary struct {
	ConsoleUsers struct {
		Total   int `json:"total"`
		Admins  int `json:"admins"`
		Editors int `json:"editors"`
		Viewers int `json:"viewers"`
	} `json:"consoleUsers"`
	K8sServiceAccounts struct {
		Total    int      `json:"total"`
		Clusters []string `json:"clusters"`
	} `json:"k8sServiceAccounts"`
	CurrentUserPermissions []ClusterPermissions `json:"currentUserPermissions"`
}

// UpdateUserRoleRequest represents a request to update a user's role
type UpdateUserRoleRequest struct {
	Role UserRole `json:"role"`
}

// CreateServiceAccountRequest represents a request to create a ServiceAccount
type CreateServiceAccountRequest struct {
	Name      string `json:"name"`
	Namespace string `json:"namespace"`
	Cluster   string `json:"cluster"`
}

// CreateRoleBindingRequest represents a request to create a RoleBinding
type CreateRoleBindingRequest struct {
	Name         string                 `json:"name"`
	Namespace    string                 `json:"namespace,omitempty"` // Empty for ClusterRoleBinding
	Cluster      string                 `json:"cluster"`
	IsCluster    bool                   `json:"isCluster"`
	RoleName     string                 `json:"roleName"`
	RoleKind     string                 `json:"roleKind"` // Role or ClusterRole
	SubjectKind  K8sSubjectKind         `json:"subjectKind"`
	SubjectName  string                 `json:"subjectName"`
	SubjectNS    string                 `json:"subjectNamespace,omitempty"` // For ServiceAccount
}

// AuditLogEntry represents an audit log entry for user management actions
type AuditLogEntry struct {
	ID          uuid.UUID `json:"id"`
	UserID      uuid.UUID `json:"userId"`
	Action      string    `json:"action"` // create_user, update_role, delete_user, create_sa, create_binding
	TargetType  string    `json:"targetType"` // console_user, service_account, role_binding
	TargetID    string    `json:"targetId"`
	Details     string    `json:"details,omitempty"`
	CreatedAt   time.Time `json:"createdAt"`
}

// CanIRequest represents a request to check if user can perform an action
type CanIRequest struct {
	Cluster     string `json:"cluster"`
	Verb        string `json:"verb"`
	Resource    string `json:"resource"`
	Namespace   string `json:"namespace,omitempty"`
	Group       string `json:"group,omitempty"`
	Subresource string `json:"subresource,omitempty"`
	Name        string `json:"name,omitempty"`
}

// CanIResponse represents the result of a permission check
type CanIResponse struct {
	Allowed bool   `json:"allowed"`
	Reason  string `json:"reason,omitempty"`
}

// PermissionsSummaryResponse represents the API response for permission summaries
type PermissionsSummaryResponse struct {
	Clusters map[string]ClusterPermissionsSummary `json:"clusters"`
}

// ClusterPermissionsSummary represents detailed permissions for a cluster
type ClusterPermissionsSummary struct {
	IsClusterAdmin       bool     `json:"isClusterAdmin"`
	CanListNodes         bool     `json:"canListNodes"`
	CanListNamespaces    bool     `json:"canListNamespaces"`
	CanCreateNamespaces  bool     `json:"canCreateNamespaces"`
	CanManageRBAC        bool     `json:"canManageRBAC"`
	CanViewSecrets       bool     `json:"canViewSecrets"`
	AccessibleNamespaces []string `json:"accessibleNamespaces"`
}

// NamespaceDetails represents a Kubernetes namespace with metadata
type NamespaceDetails struct {
	Name      string            `json:"name"`
	Cluster   string            `json:"cluster"`
	Status    string            `json:"status"`
	Labels    map[string]string `json:"labels,omitempty"`
	CreatedAt string            `json:"createdAt"`
}

// CreateNamespaceRequest represents a request to create a namespace
type CreateNamespaceRequest struct {
	Cluster string            `json:"cluster"`
	Name    string            `json:"name"`
	Labels  map[string]string `json:"labels,omitempty"`
}

// GrantNamespaceAccessRequest represents a request to grant access to a namespace
type GrantNamespaceAccessRequest struct {
	Cluster     string `json:"cluster"`
	SubjectKind string `json:"subjectKind"` // User, Group, or ServiceAccount
	SubjectName string `json:"subjectName"`
	SubjectNS   string `json:"subjectNamespace,omitempty"` // For ServiceAccount
	Role        string `json:"role"`                       // admin, edit, view, or custom role name
}

// NamespaceAccessEntry represents a single access entry for a namespace
type NamespaceAccessEntry struct {
	BindingName string `json:"bindingName"`
	SubjectKind string `json:"subjectKind"`
	SubjectName string `json:"subjectName"`
	SubjectNS   string `json:"subjectNamespace,omitempty"`
	RoleName    string `json:"roleName"`
	RoleKind    string `json:"roleKind"`
}
