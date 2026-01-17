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
