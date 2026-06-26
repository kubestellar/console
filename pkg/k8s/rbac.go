package k8s

import (
	"context"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/safego"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// maxConcurrentClusterRBACQueries bounds how many clusters GetAllClusterPermissions
// and GetAllPermissionsSummaries fan out to at once. A plain unbounded errgroup would let 50+ clusters each
// hammer the kube-apiserver with five SelfSubjectAccessReview calls
// concurrently, which can saturate a control plane. 5 is a deliberate
// compromise — high enough that a typical 5-10 cluster setup sees near-zero
// serialization, low enough that a 50-cluster fleet queues requests in
// batches of 5 and stays inside the handler's overall rbacAnalysisTimeout.
const maxConcurrentClusterRBACQueries = 5

// perClusterRBACTimeout caps the per-cluster RBAC summary fetch. The previous
// code relied only on the caller's parent timeout (rbacAnalysisTimeout ~45s),
// which let a single slow cluster consume the entire UI-facing budget. 15s
// is short enough that the UI is never held hostage by one dead cluster and
// long enough that a healthy cluster with 5 SelfSubjectAccessReview calls
// finishes comfortably within budget.
const perClusterRBACTimeout = 15 * time.Second

// RBACDefaultTimeout is the per-cluster timeout for standard RBAC queries.
// Used by both pkg/api/handlers/rbac.go and pkg/agent/server_rbac.go for
// single-cluster permission checks and RBAC data fetches. Centralized here
// to prevent drift between API and agent timeout values.
const RBACDefaultTimeout = 15 * time.Second

// podExecResource, podExecSubresource, and podExecVerb describe the
// Kubernetes RBAC tuple required to open a shell inside a pod. Centralised so
// the authorization check for the /ws/exec handler (#8120) and any future
// caller stay in lockstep with the kubelet's own RBAC enforcement for
// `pods/exec`. Do not inline these as string literals — see CLAUDE.md "No
// Magic Numbers/Strings" rule.
const (
	podExecResource    = "pods"
	podExecSubresource = "exec"
	podExecVerb        = "create"
)

// CanIResult represents the result of a permission check with details
type CanIResult struct {
	Allowed bool   `json:"allowed"`
	Reason  string `json:"reason,omitempty"`
}

// PermissionsSummary represents comprehensive permission info for a cluster
type PermissionsSummary struct {
	Cluster              string   `json:"cluster"`
	IsClusterAdmin       bool     `json:"isClusterAdmin"`
	CanListNodes         bool     `json:"canListNodes"`
	CanListNamespaces    bool     `json:"canListNamespaces"`
	CanCreateNamespaces  bool     `json:"canCreateNamespaces"`
	CanManageRBAC        bool     `json:"canManageRBAC"`
	CanViewSecrets       bool     `json:"canViewSecrets"`
	AccessibleNamespaces []string `json:"accessibleNamespaces"`
}

// isSystemNamespace returns true for Kubernetes system namespaces whose
// ServiceAccounts should be excluded from user-facing counts.
func isSystemNamespace(ns string) bool {
	return ns == "kube-system" || ns == "kube-public" || ns == "kube-node-lease"
}

// countServiceAccountsInCluster lists ServiceAccounts directly (without
// fetching RoleBindings/ClusterRoleBindings) and returns the number of
// non-system ones.  This is much cheaper than ListServiceAccounts which
// also builds a roles map that is unnecessary for counting.
func (m *MultiClusterClient) countServiceAccountsInCluster(ctx context.Context, contextName string) (int, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return 0, err
	}

	sas, err := client.CoreV1().ServiceAccounts("").List(ctx, metav1.ListOptions{})
	if err != nil {
		return 0, err
	}

	count := 0
	for _, sa := range sas.Items {
		if !isSystemNamespace(sa.Namespace) {
			count++
		}
	}
	return count, nil
}

// CountServiceAccountsAllClusters returns total SA count across all clusters.
// It fans out requests in parallel (one goroutine per cluster) and only lists
// ServiceAccounts — it no longer fetches RoleBindings/ClusterRoleBindings,
// which were previously pulled in by ListServiceAccounts but never used here.
func (m *MultiClusterClient) CountServiceAccountsAllClusters(ctx context.Context) (int, []string, error) {
	clusters, err := m.ListClusters(ctx)
	if err != nil {
		return 0, nil, err
	}

	var (
		mu           sync.Mutex
		wg           sync.WaitGroup
		total        int
		clusterNames []string
	)

	wg.Add(len(clusters))
	for _, cluster := range clusters {
		name := cluster.Name
		safego.Go(func() {
			defer wg.Done()
			count, err := m.countServiceAccountsInCluster(ctx, name)
			if err != nil {
				slog.Warn("[RBAC] service account count skipped for unreachable cluster", "cluster", name, "error", err)
				return
			}
			mu.Lock()
			total += count
			clusterNames = append(clusterNames, name)
			mu.Unlock()
		})
	}
	wg.Wait()

	return total, clusterNames, nil
}

// GetAllK8sUsers returns all unique users/subjects across role bindings
func (m *MultiClusterClient) GetAllK8sUsers(ctx context.Context, contextName string) ([]models.K8sUser, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	seen := make(map[string]bool)
	var users []models.K8sUser

	// From RoleBindings
	rbs, err := client.RbacV1().RoleBindings("").List(ctx, metav1.ListOptions{})
	if err == nil {
		for _, rb := range rbs.Items {
			for _, subject := range rb.Subjects {
				key := fmt.Sprintf("%s/%s/%s", subject.Kind, subject.Name, subject.Namespace)
				if !seen[key] {
					seen[key] = true
					users = append(users, models.K8sUser{
						Kind:      models.K8sSubjectKind(subject.Kind),
						Name:      subject.Name,
						Namespace: subject.Namespace,
						Cluster:   contextName,
					})
				}
			}
		}
	}

	// From ClusterRoleBindings
	crbs, err := client.RbacV1().ClusterRoleBindings().List(ctx, metav1.ListOptions{})
	if err == nil {
		for _, crb := range crbs.Items {
			for _, subject := range crb.Subjects {
				key := fmt.Sprintf("%s/%s/%s", subject.Kind, subject.Name, subject.Namespace)
				if !seen[key] {
					seen[key] = true
					users = append(users, models.K8sUser{
						Kind:      models.K8sSubjectKind(subject.Kind),
						Name:      subject.Name,
						Namespace: subject.Namespace,
						Cluster:   contextName,
					})
				}
			}
		}
	}

	return users, nil
}
