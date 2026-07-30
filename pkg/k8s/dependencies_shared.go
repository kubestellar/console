package k8s

import (
	"sync"
	"time"

	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

type DependencyKind string

const (
	DepNamespace          DependencyKind = "Namespace"
	DepClusterRole        DependencyKind = "ClusterRole"
	DepClusterRoleBinding DependencyKind = "ClusterRoleBinding"
	DepServiceAccount     DependencyKind = "ServiceAccount"
	DepConfigMap          DependencyKind = "ConfigMap"
	DepSecret             DependencyKind = "Secret"
	DepPVC                DependencyKind = "PersistentVolumeClaim"
	DepRole               DependencyKind = "Role"
	DepRoleBinding        DependencyKind = "RoleBinding"
	DepService            DependencyKind = "Service"
	DepIngress            DependencyKind = "Ingress"
	DepNetworkPolicy      DependencyKind = "NetworkPolicy"
	DepHPA                DependencyKind = "HorizontalPodAutoscaler"
	DepPDB                DependencyKind = "PodDisruptionBudget"
	DepCRD                DependencyKind = "CustomResourceDefinition"
	DepValidatingWebhook  DependencyKind = "ValidatingWebhookConfiguration"
	DepMutatingWebhook    DependencyKind = "MutatingWebhookConfiguration"
)

var depApplyOrder = map[DependencyKind]int{
	DepNamespace:          0,
	DepClusterRole:        1,
	DepClusterRoleBinding: 2,
	DepServiceAccount:     3,
	DepRole:               4,
	DepRoleBinding:        5,
	DepConfigMap:          6,
	DepSecret:             7,
	DepPVC:                8,
	DepService:            9,
	DepIngress:            10,
	DepNetworkPolicy:      11,
	DepHPA:                12,
	DepPDB:                13,
	DepCRD:                14,
	DepValidatingWebhook:  15,
	DepMutatingWebhook:    16,
}

const rbacCacheTTL = 30 * time.Second
const maxParallelFetches = 10

type rbacCacheEntry struct {
	items     []unstructured.Unstructured
	fetchedAt time.Time
}

type rbacCache struct {
	mu    sync.RWMutex
	store map[string]rbacCacheEntry
}

var globalRBACCache = &rbacCache{store: make(map[string]rbacCacheEntry)}

func (c *rbacCache) get(key string) ([]unstructured.Unstructured, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	entry, ok := c.store[key]
	if !ok || time.Since(entry.fetchedAt) > rbacCacheTTL {
		return nil, false
	}
	return entry.items, true
}

func (c *rbacCache) set(key string, items []unstructured.Unstructured) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.store[key] = rbacCacheEntry{items: items, fetchedAt: time.Now()}
}

var (
	gvrNamespaces          = schema.GroupVersionResource{Version: "v1", Resource: "namespaces"}
	gvrConfigMaps          = schema.GroupVersionResource{Version: "v1", Resource: "configmaps"}
	gvrSecrets             = schema.GroupVersionResource{Version: "v1", Resource: "secrets"}
	gvrServiceAccounts     = schema.GroupVersionResource{Version: "v1", Resource: "serviceaccounts"}
	gvrServices            = schema.GroupVersionResource{Version: "v1", Resource: "services"}
	gvrPVCs                = schema.GroupVersionResource{Version: "v1", Resource: "persistentvolumeclaims"}
	gvrRoles               = schema.GroupVersionResource{Group: "rbac.authorization.k8s.io", Version: "v1", Resource: "roles"}
	gvrRoleBindings        = schema.GroupVersionResource{Group: "rbac.authorization.k8s.io", Version: "v1", Resource: "rolebindings"}
	gvrClusterRoles        = schema.GroupVersionResource{Group: "rbac.authorization.k8s.io", Version: "v1", Resource: "clusterroles"}
	gvrClusterRoleBindings = schema.GroupVersionResource{Group: "rbac.authorization.k8s.io", Version: "v1", Resource: "clusterrolebindings"}
	gvrIngresses           = schema.GroupVersionResource{Group: "networking.k8s.io", Version: "v1", Resource: "ingresses"}
	gvrNetworkPolicies     = schema.GroupVersionResource{Group: "networking.k8s.io", Version: "v1", Resource: "networkpolicies"}
	gvrHPAs                = schema.GroupVersionResource{Group: "autoscaling", Version: "v2", Resource: "horizontalpodautoscalers"}
	gvrPDBs                = schema.GroupVersionResource{Group: "policy", Version: "v1", Resource: "poddisruptionbudgets"}
	gvrCRDs                = schema.GroupVersionResource{Group: "apiextensions.k8s.io", Version: "v1", Resource: "customresourcedefinitions"}
	gvrValidatingWebhooks  = schema.GroupVersionResource{Group: "admissionregistration.k8s.io", Version: "v1", Resource: "validatingwebhookconfigurations"}
	gvrMutatingWebhooks    = schema.GroupVersionResource{Group: "admissionregistration.k8s.io", Version: "v1", Resource: "mutatingwebhookconfigurations"}
)

type Dependency struct {
	Kind      DependencyKind
	Name      string
	Namespace string
	GVR       schema.GroupVersionResource
	Object    *unstructured.Unstructured
	Order     int
	Optional  bool
}

type DependencyBundle struct {
	Workload     *unstructured.Unstructured
	Dependencies []Dependency
	Warnings     []string
}

// DeployOptions configures how a workload is deployed across clusters
type DeployOptions struct {
	DeployedBy string
	GroupName  string
}
