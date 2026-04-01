package handlers

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/exec"
	"strings"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"github.com/kubestellar/console/pkg/api/v1alpha1"
	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/mcp"
)

// Maximum number of concurrent helm/kubectl subprocesses across all handlers.
// Each helm ls or kubectl command can use 100-300MB; with 18 clusters running
// unbounded, the process was OOM-killed at ~3.6GB.
const maxConcurrentSubprocesses = 4

// Semaphore channel to limit concurrent subprocess fan-outs
var subprocessSem = make(chan struct{}, maxConcurrentSubprocesses)

// GitOpsDrift represents a configuration drift between Git and cluster
type GitOpsDrift struct {
	Resource   string `json:"resource"`
	Namespace  string `json:"namespace"`
	Cluster    string `json:"cluster"`
	Kind       string `json:"kind"`
	DriftType  string `json:"driftType"`  // modified, deleted, added
	GitVersion string `json:"gitVersion"` // Git commit/tag
	Details    string `json:"details,omitempty"`
	Severity   string `json:"severity"` // low, medium, high
}

// GitOpsHandlers handles GitOps-related API endpoints
type GitOpsHandlers struct {
	bridge    *mcp.Bridge
	k8sClient *k8s.MultiClusterClient
}

// NewGitOpsHandlers creates a new GitOps handlers instance
func NewGitOpsHandlers(bridge *mcp.Bridge, k8sClient *k8s.MultiClusterClient) *GitOpsHandlers {
	return &GitOpsHandlers{
		bridge:    bridge,
		k8sClient: k8sClient,
	}
}

// DriftedResource represents a resource that has drifted from git
type DriftedResource struct {
	Kind         string `json:"kind"`
	Name         string `json:"name"`
	Namespace    string `json:"namespace"`
	Field        string `json:"field"`
	GitValue     string `json:"gitValue"`
	ClusterValue string `json:"clusterValue"`
	DiffOutput   string `json:"diffOutput,omitempty"`
}

// DetectDriftRequest is the request body for drift detection
type DetectDriftRequest struct {
	RepoURL   string `json:"repoUrl"`
	Path      string `json:"path"`
	Branch    string `json:"branch,omitempty"`
	Cluster   string `json:"cluster,omitempty"`
	Namespace string `json:"namespace,omitempty"`
}

// DetectDriftResponse is the response from drift detection
type DetectDriftResponse struct {
	Drifted    bool              `json:"drifted"`
	Resources  []DriftedResource `json:"resources"`
	Source     string            `json:"source"` // "mcp" or "kubectl"
	RawDiff    string            `json:"rawDiff,omitempty"`
	TokensUsed int               `json:"tokensUsed,omitempty"`
}

// SyncRequest is the request body for sync operation
type SyncRequest struct {
	RepoURL   string `json:"repoUrl"`
	Path      string `json:"path"`
	Branch    string `json:"branch,omitempty"`
	Cluster   string `json:"cluster,omitempty"`
	Namespace string `json:"namespace,omitempty"`
	DryRun    bool   `json:"dryRun,omitempty"`
}

// SyncResponse is the response from sync operation
type SyncResponse struct {
	Success    bool     `json:"success"`
	Message    string   `json:"message"`
	Applied    []string `json:"applied,omitempty"`
	Errors     []string `json:"errors,omitempty"`
	Source     string   `json:"source"` // "mcp" or "kubectl"
	TokensUsed int      `json:"tokensUsed,omitempty"`
}

// HelmRelease represents a Helm release from helm ls
type HelmRelease struct {
	Name       string `json:"name"`
	Namespace  string `json:"namespace"`
	Revision   string `json:"revision"`
	Updated    string `json:"updated"`
	Status     string `json:"status"`
	Chart      string `json:"chart"`
	AppVersion string `json:"app_version"`
	Cluster    string `json:"cluster,omitempty"`
}

// HelmHistoryEntry represents a single history entry for a Helm release
type HelmHistoryEntry struct {
	Revision    int    `json:"revision"`
	Updated     string `json:"updated"`
	Status      string `json:"status"`
	Chart       string `json:"chart"`
	AppVersion  string `json:"app_version"`
	Description string `json:"description"`
}

// Kustomization represents a Flux Kustomization resource
type Kustomization struct {
	Name       string `json:"name"`
	Namespace  string `json:"namespace"`
	Path       string `json:"path"`
	SourceRef  string `json:"sourceRef"`
	Ready      bool   `json:"ready"`
	Status     string `json:"status"`
	Message    string `json:"message,omitempty"`
	LastApplied string `json:"lastApplied,omitempty"`
	Cluster    string `json:"cluster,omitempty"`
}

// Operator represents an OLM ClusterServiceVersion (installed operator)
type Operator struct {
	Name        string `json:"name"`
	DisplayName string `json:"displayName"`
	Namespace   string `json:"namespace"`
	Version     string `json:"version"`
	Phase       string `json:"phase"` // Succeeded, Failed, Installing, etc.
	Channel     string `json:"channel,omitempty"`
	Source      string `json:"source,omitempty"`
	Cluster     string `json:"cluster,omitempty"`
}

// ListDrifts returns a list of detected drifts (for GET endpoint)
func (h *GitOpsHandlers) ListDrifts(c *fiber.Ctx) error {
	// Optional query params for filtering
	// cluster := c.Query("cluster")
	// namespace := c.Query("namespace")

	// Return empty list - actual drift detection requires specific repo/path
	// which should be done via POST /api/gitops/detect-drift
	return c.JSON(fiber.Map{
		"drifts": []GitOpsDrift{},
	})
}

// ListHelmReleases returns all Helm releases across all namespaces
func (h *GitOpsHandlers) ListHelmReleases(c *fiber.Ctx) error {
	cluster := c.Query("cluster")

	// If specific cluster requested, query only that cluster
	if cluster != "" {
		return h.listHelmReleasesForCluster(c, cluster)
	}

	// Query all clusters in parallel with timeout
	if h.k8sClient != nil {
		hcCtx, hcCancel := context.WithTimeout(c.Context(), gitopsLookupTimeout)
		defer hcCancel()

		clusters, _, err := h.k8sClient.HealthyClusters(hcCtx)
		if err != nil {
			log.Printf("error listing healthy clusters for releases: %v", err)
			return c.Status(500).JSON(fiber.Map{"error": "internal server error", "releases": []HelmRelease{}})
		}

		var wg sync.WaitGroup
		var mu sync.Mutex
		allReleases := make([]HelmRelease, 0)

		for _, cl := range clusters {
			wg.Add(1)
			go func(clusterName string) {
				defer wg.Done()
				subprocessSem <- struct{}{}        // acquire
				defer func() { <-subprocessSem }() // release
				ctx, cancel := context.WithTimeout(c.Context(), helmStreamPerClusterTimeout)
				defer cancel()

				releases := h.getHelmReleasesForCluster(ctx, clusterName)
				if len(releases) > 0 {
					mu.Lock()
					allReleases = append(allReleases, releases...)
					mu.Unlock()
				}
			}(cl.Name)
		}

		wg.Wait()
		return c.JSON(fiber.Map{"releases": allReleases})
	}

	// Fallback to default context
	return h.listHelmReleasesForCluster(c, "")
}

// listHelmReleasesForCluster lists helm releases for a specific cluster
func (h *GitOpsHandlers) listHelmReleasesForCluster(c *fiber.Ctx, cluster string) error {
	ctx, cancel := context.WithTimeout(c.Context(), helmStreamPerClusterTimeout)
	defer cancel()

	releases := h.getHelmReleasesForCluster(ctx, cluster)
	return c.JSON(fiber.Map{"releases": releases})
}

// getHelmReleasesForCluster gets helm releases for a specific cluster
func (h *GitOpsHandlers) getHelmReleasesForCluster(ctx context.Context, cluster string) []HelmRelease {
	args := []string{"ls", "-A", "--output", "json"}
	if cluster != "" {
		args = append(args, "--kube-context", cluster)
	}

	cmd := exec.CommandContext(ctx, "helm", args...)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		log.Printf("helm ls failed for cluster %s: %v, stderr: %s", cluster, err, stderr.String())
		return []HelmRelease{}
	}

	releases := make([]HelmRelease, 0)
	if err := json.Unmarshal(stdout.Bytes(), &releases); err != nil {
		log.Printf("failed to parse helm ls output for cluster %s: %v", cluster, err)
		return []HelmRelease{}
	}

	// Add cluster info to each release
	for i := range releases {
		releases[i].Cluster = cluster
	}

	return releases
}

// ListKustomizations returns Flux Kustomization resources
func (h *GitOpsHandlers) ListKustomizations(c *fiber.Ctx) error {
	cluster := c.Query("cluster")

	// If specific cluster requested, query only that cluster
	if cluster != "" {
		ctx, cancel := context.WithTimeout(c.Context(), helmStreamPerClusterTimeout)
		defer cancel()

		kustomizations := h.getKustomizationsForCluster(ctx, cluster)
		return c.JSON(fiber.Map{"kustomizations": kustomizations})
	}

	// Query all clusters in parallel with timeout
	if h.k8sClient != nil {
		clusters, _, err := h.k8sClient.HealthyClusters(c.Context())
		if err != nil {
			log.Printf("error listing healthy clusters for kustomizations: %v", err)
			return c.Status(500).JSON(fiber.Map{"error": "internal server error", "kustomizations": []Kustomization{}})
		}

		var wg sync.WaitGroup
		var mu sync.Mutex
		allKustomizations := make([]Kustomization, 0)
		clusterTimeout := gitopsClusterTimeout

		clusterCtx, clusterCancel := context.WithCancel(c.Context())
		defer clusterCancel()

		for _, cl := range clusters {
			wg.Add(1)
			go func(clusterName string) {
				defer wg.Done()
				subprocessSem <- struct{}{}        // acquire
				defer func() { <-subprocessSem }() // release
				ctx, cancel := context.WithTimeout(clusterCtx, clusterTimeout)
				defer cancel()

				kustomizations := h.getKustomizationsForCluster(ctx, clusterName)
				if len(kustomizations) > 0 {
					mu.Lock()
					allKustomizations = append(allKustomizations, kustomizations...)
					mu.Unlock()
				}
			}(cl.Name)
		}

		waitWithDeadline(&wg, clusterCancel, maxResponseDeadline)
		return c.JSON(fiber.Map{"kustomizations": allKustomizations})
	}

	// Fallback to default context
	fallbackCtx, fallbackCancel := context.WithTimeout(c.Context(), helmStreamPerClusterTimeout)
	defer fallbackCancel()

	kustomizations := h.getKustomizationsForCluster(fallbackCtx, "")
	return c.JSON(fiber.Map{"kustomizations": kustomizations})
}

// getKustomizationsForCluster gets kustomizations for a specific cluster
func (h *GitOpsHandlers) getKustomizationsForCluster(ctx context.Context, cluster string) []Kustomization {
	args := []string{"get", "kustomizations.kustomize.toolkit.fluxcd.io", "-A", "-o", "json"}
	if cluster != "" {
		args = append([]string{"--context", cluster}, args...)
	}

	cmd := exec.CommandContext(ctx, "kubectl", args...)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		log.Printf("kubectl get kustomizations failed for cluster %s: %v, stderr: %s", cluster, err, stderr.String())
		return []Kustomization{}
	}

	var result struct {
		Items []struct {
			Metadata struct {
				Name      string `json:"name"`
				Namespace string `json:"namespace"`
			} `json:"metadata"`
			Spec struct {
				Path      string `json:"path"`
				SourceRef struct {
					Kind string `json:"kind"`
					Name string `json:"name"`
				} `json:"sourceRef"`
			} `json:"spec"`
			Status struct {
				Conditions []struct {
					Type    string `json:"type"`
					Status  string `json:"status"`
					Message string `json:"message"`
				} `json:"conditions"`
				LastAppliedRevision string `json:"lastAppliedRevision"`
			} `json:"status"`
		} `json:"items"`
	}

	if err := json.Unmarshal(stdout.Bytes(), &result); err != nil {
		log.Printf("failed to parse kustomizations for cluster %s: %v", cluster, err)
		return []Kustomization{}
	}

	kustomizations := make([]Kustomization, 0, len(result.Items))
	for _, item := range result.Items {
		k := Kustomization{
			Name:      item.Metadata.Name,
			Namespace: item.Metadata.Namespace,
			Path:      item.Spec.Path,
			SourceRef: fmt.Sprintf("%s/%s", item.Spec.SourceRef.Kind, item.Spec.SourceRef.Name),
			Cluster:   cluster,
		}

		for _, cond := range item.Status.Conditions {
			if cond.Type == "Ready" {
				k.Ready = cond.Status == "True"
				k.Status = "Ready"
				if !k.Ready {
					k.Status = "NotReady"
				}
				k.Message = cond.Message
				break
			}
		}
		k.LastApplied = item.Status.LastAppliedRevision
		kustomizations = append(kustomizations, k)
	}

	return kustomizations
}

// OperatorSubscription represents an OLM subscription
type OperatorSubscription struct {
	Name                string `json:"name"`
	Namespace           string `json:"namespace"`
	Channel             string `json:"channel"`
	Source              string `json:"source"`
	InstallPlanApproval string `json:"installPlanApproval"`
	CurrentCSV          string `json:"currentCSV"`
	InstalledCSV        string `json:"installedCSV,omitempty"`
	Cluster             string `json:"cluster,omitempty"`
}

// Operator/subscription timeouts — CSV queries take 90-100s for clusters with
// 1000+ CSVs (e.g. vllm-d has 1381 CSVs). The jsonpath extraction in kubectl
// is the bottleneck, not network transfer.
const (
	operatorPerClusterTimeout     = 180 * time.Second
	operatorRestOverallTimeout    = 200 * time.Second
	subscriptionPerClusterTimeout = 30 * time.Second
	helmStreamPerClusterTimeout   = 30 * time.Second
	operatorCacheTTL              = 5 * time.Minute
	gitopsClusterTimeout          = 15 * time.Second
	gitopsRetryDelay              = 2 * time.Second
	gitopsLookupTimeout           = 10 * time.Second
	gitopsDefaultTimeout          = 30 * time.Second
)

// operatorCacheEntry holds cached operators for a single cluster.
type operatorCacheEntry struct {
	operators []Operator
	fetchedAt time.Time
}

// operatorCache is a per-cluster in-memory cache for slow CSV queries.
// Protected by operatorCacheMu. Background refresh populates the cache
// so that subsequent page loads are instant.
var (
	operatorCacheMu   sync.RWMutex
	operatorCacheData = make(map[string]*operatorCacheEntry)
)

// ListOperators returns OLM-managed operators (ClusterServiceVersions)
func (h *GitOpsHandlers) ListOperators(c *fiber.Ctx) error {
	cluster := c.Query("cluster")

	// If specific cluster requested, query only that cluster
	if cluster != "" {
		ctx, cancel := context.WithTimeout(c.Context(), operatorPerClusterTimeout)
		defer cancel()
		operators := h.getOperatorsForCluster(ctx, cluster)
		return c.JSON(fiber.Map{"operators": operators})
	}

	// Query all clusters in parallel — operators are slow, so we wait for all
	// (no maxResponseDeadline; SSE streaming is preferred for UI)
	if h.k8sClient != nil {
		clusters, _, err := h.k8sClient.HealthyClusters(c.Context())
		if err != nil {
			log.Printf("error listing healthy clusters for operators: %v", err)
			return c.Status(500).JSON(fiber.Map{"error": "internal server error", "operators": []Operator{}})
		}

		var wg sync.WaitGroup
		var mu sync.Mutex
		allOperators := make([]Operator, 0)

		overallCtx, overallCancel := context.WithTimeout(c.Context(), operatorRestOverallTimeout)
		defer overallCancel()

		for _, cl := range clusters {
			wg.Add(1)
			go func(clusterName string) {
				defer wg.Done()
				subprocessSem <- struct{}{}        // acquire
				defer func() { <-subprocessSem }() // release
				ctx, cancel := context.WithTimeout(overallCtx, operatorPerClusterTimeout)
				defer cancel()

				operators := h.getOperatorsForCluster(ctx, clusterName)
				if len(operators) > 0 {
					mu.Lock()
					allOperators = append(allOperators, operators...)
					mu.Unlock()
				}
			}(cl.Name)
		}

		wg.Wait()
		return c.JSON(fiber.Map{"operators": allOperators})
	}

	// Fallback to default context
	ctx, cancel := context.WithTimeout(c.Context(), operatorPerClusterTimeout)
	defer cancel()
	operators := h.getOperatorsForCluster(ctx, "")
	return c.JSON(fiber.Map{"operators": operators})
}

// StreamOperators streams operators per cluster via SSE for progressive rendering
func (h *GitOpsHandlers) StreamOperators(c *fiber.Ctx) error {
	cluster := c.Query("cluster")

	if isDemoMode(c) {
		return streamDemoSSE(c, "operators", getDemoOperatorsForStreaming())
	}

	if h.k8sClient == nil {
		return c.Status(503).JSON(fiber.Map{"error": "No cluster access"})
	}

	// Single cluster — return as single SSE event
	if cluster != "" {
		c.Set("Content-Type", "text/event-stream")
		c.Set("Cache-Control", "no-cache")
		c.Set("Connection", "keep-alive")
		c.Set("X-Accel-Buffering", "no")
		c.Context().SetBodyStreamWriter(func(w *bufio.Writer) {
			writeSSEEvent(w, "connected", fiber.Map{"status": "streaming"})
			ctx, cancel := context.WithTimeout(context.Background(), operatorPerClusterTimeout)
			defer cancel()
			operators := h.getOperatorsForCluster(ctx, cluster)
			writeSSEEvent(w, "cluster_data", fiber.Map{
				"cluster":   cluster,
				"operators": operators,
				"source":    "k8s",
			})
			writeSSEEvent(w, "done", fiber.Map{"totalClusters": 1, "completedClusters": 1})
		})
		return nil
	}

	clusters, _, err := h.k8sClient.HealthyClusters(c.Context())
	if err != nil {
		return handleK8sError(c, err)
	}

	c.Set("Content-Type", "text/event-stream")
	c.Set("Cache-Control", "no-cache")
	c.Set("Connection", "keep-alive")
	c.Set("X-Accel-Buffering", "no")

	c.Context().SetBodyStreamWriter(func(w *bufio.Writer) {
		writeSSEEvent(w, "connected", fiber.Map{"status": "streaming"})

		var wg sync.WaitGroup
		var mu sync.Mutex
		completedClusters := 0
		totalClusters := len(clusters)

		for _, cl := range clusters {
			wg.Add(1)
			go func(clusterName string) {
				defer wg.Done()
				subprocessSem <- struct{}{}        // acquire
				defer func() { <-subprocessSem }() // release
				ctx, cancel := context.WithTimeout(context.Background(), operatorPerClusterTimeout)
				defer cancel()

				operators := h.getOperatorsForCluster(ctx, clusterName)
				mu.Lock()
				completedClusters++
				// Always send cluster_data — even for empty clusters so the
				// frontend sees progress and knows the stream is alive.
				writeSSEEvent(w, "cluster_data", fiber.Map{
					"cluster":   clusterName,
					"operators": operators,
					"source":    "k8s",
				})
				mu.Unlock()
			}(cl.Name)
		}

		wg.Wait()
		writeSSEEvent(w, "done", fiber.Map{
			"totalClusters":     totalClusters,
			"completedClusters": completedClusters,
		})
	})

	return nil
}

// getOperatorsForCluster returns cached operators when available, otherwise
// fetches from the cluster using kubectl -o json (faster than jsonpath for
// large result sets) and caches the result.
func (h *GitOpsHandlers) getOperatorsForCluster(ctx context.Context, cluster string) []Operator {
	cacheKey := cluster
	if cacheKey == "" {
		cacheKey = "__default__"
	}

	// Check cache first
	operatorCacheMu.RLock()
	if entry, ok := operatorCacheData[cacheKey]; ok && time.Since(entry.fetchedAt) < operatorCacheTTL {
		operators := entry.operators
		operatorCacheMu.RUnlock()
		return operators
	}
	operatorCacheMu.RUnlock()

	// Cache miss — fetch from cluster with retry for transient errors
	operators, err := h.fetchOperatorsFromCluster(ctx, cluster)
	if err != nil {
		// Permanent errors (cluster lacks OLM) — cache empty result
		if _, ok := err.(errPermanent); ok {
			operatorCacheMu.Lock()
			operatorCacheData[cacheKey] = &operatorCacheEntry{
				operators: []Operator{},
				fetchedAt: time.Now(),
			}
			operatorCacheMu.Unlock()
			return []Operator{}
		}
		// Retry once for transient errors (HTTP/2 stream errors, connection resets)
		if ctx.Err() == nil {
			log.Printf("Retrying operator fetch for cluster %s after transient error", cluster)
			time.Sleep(gitopsRetryDelay)
			operators, err = h.fetchOperatorsFromCluster(ctx, cluster)
		}
	}

	if err != nil {
		// Transient failure — do NOT cache so next request retries
		return []Operator{}
	}

	// Store in cache
	operatorCacheMu.Lock()
	operatorCacheData[cacheKey] = &operatorCacheEntry{
		operators: operators,
		fetchedAt: time.Now(),
	}
	operatorCacheMu.Unlock()

	return operators
}

// errPermanent wraps an error to indicate it should be cached (e.g., cluster lacks OLM).
type errPermanent struct{ error }

// fetchOperatorsFromCluster queries a cluster for CSVs using kubectl -o json.
// Returns (operators, nil) on success, (nil, errPermanent) for permanent errors
// (cluster lacks CSV resource), or (nil, error) for transient errors.
func (h *GitOpsHandlers) fetchOperatorsFromCluster(ctx context.Context, cluster string) ([]Operator, error) {
	args := []string{"get", "csv", "-A", "-o", "json", "--request-timeout=0"}
	if cluster != "" {
		args = append([]string{"--context", cluster}, args...)
	}

	cmd := exec.CommandContext(ctx, "kubectl", args...)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		stderrStr := stderr.String()
		if ctx.Err() == nil {
			log.Printf("kubectl get csv failed for cluster %s: %v, stderr: %s", cluster, err, stderrStr)
		} else {
			log.Printf("kubectl get csv timed out for cluster %s", cluster)
		}
		// "doesn't have a resource type" = cluster lacks OLM — permanent, safe to cache
		if strings.Contains(stderrStr, "doesn't have a resource type") {
			return nil, errPermanent{err}
		}
		return nil, err
	}

	// Parse only the fields we need from the JSON output
	var result struct {
		Items []struct {
			Metadata struct {
				Name      string `json:"name"`
				Namespace string `json:"namespace"`
			} `json:"metadata"`
			Spec struct {
				DisplayName string `json:"displayName"`
				Version     string `json:"version"`
			} `json:"spec"`
			Status struct {
				Phase string `json:"phase"`
			} `json:"status"`
		} `json:"items"`
	}

	if err := json.Unmarshal(stdout.Bytes(), &result); err != nil {
		log.Printf("failed to parse operators JSON for cluster %s: %v", cluster, err)
		return nil, err
	}

	operators := make([]Operator, 0, len(result.Items))
	for _, item := range result.Items {
		displayName := item.Spec.DisplayName
		if displayName == "" {
			displayName = item.Metadata.Name
		}
		operators = append(operators, Operator{
			Name:        item.Metadata.Name,
			Namespace:   item.Metadata.Namespace,
			DisplayName: displayName,
			Version:     item.Spec.Version,
			Phase:       item.Status.Phase,
			Cluster:     cluster,
		})
	}

	return operators, nil
}

// ListOperatorSubscriptions returns OLM subscriptions across clusters
func (h *GitOpsHandlers) ListOperatorSubscriptions(c *fiber.Ctx) error {
	cluster := c.Query("cluster")

	if cluster != "" {
		ctx, cancel := context.WithTimeout(c.Context(), subscriptionPerClusterTimeout)
		defer cancel()
		subs := h.getSubscriptionsForCluster(ctx, cluster)
		return c.JSON(fiber.Map{"subscriptions": subs})
	}

	if h.k8sClient != nil {
		clusters, _, err := h.k8sClient.HealthyClusters(c.Context())
		if err != nil {
			log.Printf("error listing healthy clusters for subscriptions: %v", err)
			return c.Status(500).JSON(fiber.Map{"error": "internal server error", "subscriptions": []OperatorSubscription{}})
		}

		var wg sync.WaitGroup
		var mu sync.Mutex
		allSubs := make([]OperatorSubscription, 0)

		for _, cl := range clusters {
			wg.Add(1)
			go func(clusterName string) {
				defer wg.Done()
				subprocessSem <- struct{}{}        // acquire
				defer func() { <-subprocessSem }() // release
				ctx, cancel := context.WithTimeout(c.Context(), subscriptionPerClusterTimeout)
				defer cancel()

				subs := h.getSubscriptionsForCluster(ctx, clusterName)
				if len(subs) > 0 {
					mu.Lock()
					allSubs = append(allSubs, subs...)
					mu.Unlock()
				}
			}(cl.Name)
		}

		wg.Wait()
		return c.JSON(fiber.Map{"subscriptions": allSubs})
	}

	ctx, cancel := context.WithTimeout(c.Context(), subscriptionPerClusterTimeout)
	defer cancel()
	subs := h.getSubscriptionsForCluster(ctx, "")
	return c.JSON(fiber.Map{"subscriptions": subs})
}

// StreamOperatorSubscriptions streams subscriptions per cluster via SSE
func (h *GitOpsHandlers) StreamOperatorSubscriptions(c *fiber.Ctx) error {
	cluster := c.Query("cluster")

	if isDemoMode(c) {
		return streamDemoSSE(c, "subscriptions", []OperatorSubscription{})
	}

	if h.k8sClient == nil {
		return c.Status(503).JSON(fiber.Map{"error": "No cluster access"})
	}

	if cluster != "" {
		c.Set("Content-Type", "text/event-stream")
		c.Set("Cache-Control", "no-cache")
		c.Set("Connection", "keep-alive")
		c.Set("X-Accel-Buffering", "no")
		c.Context().SetBodyStreamWriter(func(w *bufio.Writer) {
			writeSSEEvent(w, "connected", fiber.Map{"status": "streaming"})
			ctx, cancel := context.WithTimeout(context.Background(), subscriptionPerClusterTimeout)
			defer cancel()
			subs := h.getSubscriptionsForCluster(ctx, cluster)
			writeSSEEvent(w, "cluster_data", fiber.Map{
				"cluster":       cluster,
				"subscriptions": subs,
				"source":        "k8s",
			})
			writeSSEEvent(w, "done", fiber.Map{"totalClusters": 1, "completedClusters": 1})
		})
		return nil
	}

	clusters, _, err := h.k8sClient.HealthyClusters(c.Context())
	if err != nil {
		return handleK8sError(c, err)
	}

	c.Set("Content-Type", "text/event-stream")
	c.Set("Cache-Control", "no-cache")
	c.Set("Connection", "keep-alive")
	c.Set("X-Accel-Buffering", "no")

	c.Context().SetBodyStreamWriter(func(w *bufio.Writer) {
		writeSSEEvent(w, "connected", fiber.Map{"status": "streaming"})

		var wg sync.WaitGroup
		var mu sync.Mutex
		completedClusters := 0
		totalClusters := len(clusters)

		for _, cl := range clusters {
			wg.Add(1)
			go func(clusterName string) {
				defer wg.Done()
				subprocessSem <- struct{}{}        // acquire
				defer func() { <-subprocessSem }() // release
				ctx, cancel := context.WithTimeout(context.Background(), subscriptionPerClusterTimeout)
				defer cancel()

				subs := h.getSubscriptionsForCluster(ctx, clusterName)
				mu.Lock()
				completedClusters++
				writeSSEEvent(w, "cluster_data", fiber.Map{
					"cluster":       clusterName,
					"subscriptions": subs,
					"source":        "k8s",
				})
				mu.Unlock()
			}(cl.Name)
		}

		wg.Wait()
		writeSSEEvent(w, "done", fiber.Map{
			"totalClusters":     totalClusters,
			"completedClusters": completedClusters,
		})
	})

	return nil
}

// getSubscriptionsForCluster gets OLM subscriptions for a specific cluster using jsonpath
func (h *GitOpsHandlers) getSubscriptionsForCluster(ctx context.Context, cluster string) []OperatorSubscription {
	jsonpathExpr := `{range .items[*]}{.metadata.name}{"\t"}{.metadata.namespace}{"\t"}{.spec.channel}{"\t"}{.spec.source}{"\t"}{.spec.installPlanApproval}{"\t"}{.status.currentCSV}{"\t"}{.status.installedCSV}{"\n"}{end}`
	args := []string{"get", "subscriptions.operators.coreos.com", "-A", "-o", "jsonpath=" + jsonpathExpr}
	if cluster != "" {
		args = append([]string{"--context", cluster}, args...)
	}

	cmd := exec.CommandContext(ctx, "kubectl", args...)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		if ctx.Err() == nil {
			log.Printf("kubectl get subscriptions failed for cluster %s: %v", cluster, err)
		}
		return []OperatorSubscription{}
	}

	output := strings.TrimSpace(stdout.String())
	if output == "" {
		return []OperatorSubscription{}
	}

	lines := strings.Split(output, "\n")
	subs := make([]OperatorSubscription, 0, len(lines))
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		fields := strings.Split(line, "\t")
		if len(fields) < 6 {
			continue
		}
		sub := OperatorSubscription{
			Name:                fields[0],
			Namespace:           fields[1],
			Channel:             fields[2],
			Source:              fields[3],
			InstallPlanApproval: fields[4],
			CurrentCSV:          fields[5],
			Cluster:             cluster,
		}
		if len(fields) > 6 {
			sub.InstalledCSV = fields[6]
		}
		subs = append(subs, sub)
	}

	return subs
}

// StreamHelmReleases streams helm releases per cluster via SSE
func (h *GitOpsHandlers) StreamHelmReleases(c *fiber.Ctx) error {
	cluster := c.Query("cluster")

	if isDemoMode(c) {
		return streamDemoSSE(c, "releases", getDemoHelmReleasesForStreaming())
	}

	if h.k8sClient == nil {
		return c.Status(503).JSON(fiber.Map{"error": "No cluster access"})
	}

	if cluster != "" {
		c.Set("Content-Type", "text/event-stream")
		c.Set("Cache-Control", "no-cache")
		c.Set("Connection", "keep-alive")
		c.Set("X-Accel-Buffering", "no")
		c.Context().SetBodyStreamWriter(func(w *bufio.Writer) {
			writeSSEEvent(w, "connected", fiber.Map{"status": "streaming"})
			ctx, cancel := context.WithTimeout(context.Background(), helmStreamPerClusterTimeout)
			defer cancel()
			releases := h.getHelmReleasesForCluster(ctx, cluster)
			writeSSEEvent(w, "cluster_data", fiber.Map{
				"cluster":  cluster,
				"releases": releases,
				"source":   "k8s",
			})
			writeSSEEvent(w, "done", fiber.Map{"totalClusters": 1, "completedClusters": 1})
		})
		return nil
	}

	clusters, _, err := h.k8sClient.HealthyClusters(c.Context())
	if err != nil {
		return handleK8sError(c, err)
	}

	c.Set("Content-Type", "text/event-stream")
	c.Set("Cache-Control", "no-cache")
	c.Set("Connection", "keep-alive")
	c.Set("X-Accel-Buffering", "no")

	c.Context().SetBodyStreamWriter(func(w *bufio.Writer) {
		writeSSEEvent(w, "connected", fiber.Map{"status": "streaming"})

		var wg sync.WaitGroup
		var mu sync.Mutex
		completedClusters := 0
		totalClusters := len(clusters)

		for _, cl := range clusters {
			wg.Add(1)
			go func(clusterName string) {
				defer wg.Done()
				subprocessSem <- struct{}{}        // acquire
				defer func() { <-subprocessSem }() // release
				ctx, cancel := context.WithTimeout(context.Background(), helmStreamPerClusterTimeout)
				defer cancel()

				releases := h.getHelmReleasesForCluster(ctx, clusterName)
				mu.Lock()
				completedClusters++
				writeSSEEvent(w, "cluster_data", fiber.Map{
					"cluster":  clusterName,
					"releases": releases,
					"source":   "k8s",
				})
				mu.Unlock()
			}(cl.Name)
		}

		wg.Wait()
		writeSSEEvent(w, "done", fiber.Map{
			"totalClusters":     totalClusters,
			"completedClusters": completedClusters,
		})
	})

	return nil
}

// getDemoOperatorsForStreaming returns demo operators for SSE streaming
func getDemoOperatorsForStreaming() []Operator {
	return []Operator{
		{Name: "prometheus-operator.v0.65.1", DisplayName: "Prometheus Operator", Namespace: "monitoring", Version: "0.65.1", Phase: "Succeeded", Cluster: "demo-cluster"},
		{Name: "cert-manager.v1.12.0", DisplayName: "cert-manager", Namespace: "cert-manager", Version: "1.12.0", Phase: "Succeeded", Cluster: "demo-cluster"},
		{Name: "elasticsearch-operator.v2.8.0", DisplayName: "Elasticsearch Operator", Namespace: "elastic-system", Version: "2.8.0", Phase: "Succeeded", Cluster: "demo-cluster"},
	}
}

// getDemoHelmReleasesForStreaming returns demo helm releases for SSE streaming
func getDemoHelmReleasesForStreaming() []HelmRelease {
	return []HelmRelease{
		{Name: "prometheus", Namespace: "monitoring", Revision: "5", Status: "deployed", Chart: "prometheus-25.8.0", AppVersion: "2.48.1", Cluster: "demo-cluster"},
		{Name: "grafana", Namespace: "monitoring", Revision: "3", Status: "deployed", Chart: "grafana-7.0.11", AppVersion: "10.2.3", Cluster: "demo-cluster"},
	}
}

// DetectDrift detects drift between git and cluster state
func (h *GitOpsHandlers) DetectDrift(c *fiber.Ctx) error {
	var req DetectDriftRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid request body"})
	}

	if req.RepoURL == "" {
		return c.Status(400).JSON(fiber.Map{"error": "repoUrl is required"})
	}

	ctx, cancel := context.WithTimeout(c.Context(), gitopsDefaultTimeout)
	defer cancel()

	// Try MCP bridge first (detect_drift tool from kubestellar-ops)
	if h.bridge != nil {
		result, err := h.detectDriftViaMCP(ctx, req)
		if err == nil {
			return c.JSON(result)
		}
		log.Printf("MCP detect_drift failed, falling back to kubectl: %v", err)
	}

	// Fall back to kubectl diff
	result, err := h.detectDriftViaKubectl(ctx, req)
	if err != nil {
		return handleK8sError(c, err)
	}

	return c.JSON(result)
}

// detectDriftViaMCP uses the kubestellar-ops detect_drift tool
func (h *GitOpsHandlers) detectDriftViaMCP(ctx context.Context, req DetectDriftRequest) (*DetectDriftResponse, error) {
	args := map[string]interface{}{
		"repo_url": req.RepoURL,
		"path":     req.Path,
	}
	if req.Branch != "" {
		args["branch"] = req.Branch
	}
	if req.Cluster != "" {
		args["cluster"] = req.Cluster
	}
	if req.Namespace != "" {
		args["namespace"] = req.Namespace
	}

	result, err := h.bridge.CallOpsTool(ctx, "detect_drift", args)
	if err != nil {
		return nil, err
	}

	if result.IsError {
		if len(result.Content) > 0 {
			return nil, fmt.Errorf("MCP tool error: %s", result.Content[0].Text)
		}
		return nil, fmt.Errorf("MCP tool returned error")
	}

	// Parse MCP result - content is text that may contain JSON
	response := &DetectDriftResponse{
		Source:     "mcp",
		TokensUsed: 350, // Estimate
	}

	// Try to parse the first content item as JSON
	if len(result.Content) > 0 {
		text := result.Content[0].Text
		response.RawDiff = text

		// Try to parse as JSON for structured data
		var parsed map[string]interface{}
		if err := json.Unmarshal([]byte(text), &parsed); err == nil {
			if drifted, ok := parsed["drifted"].(bool); ok {
				response.Drifted = drifted
			}
			if resources, ok := parsed["resources"].([]interface{}); ok {
				for _, r := range resources {
					if rm, ok := r.(map[string]interface{}); ok {
						dr := DriftedResource{
							Kind:         getString(rm, "kind"),
							Name:         getString(rm, "name"),
							Namespace:    getString(rm, "namespace"),
							Field:        getString(rm, "field"),
							GitValue:     getString(rm, "gitValue"),
							ClusterValue: getString(rm, "clusterValue"),
						}
						response.Resources = append(response.Resources, dr)
					}
				}
			}
		} else {
			// If not JSON, treat the text output as drift info
			response.Drifted = strings.Contains(text, "drift") || strings.Contains(text, "changed")
		}
	}

	return response, nil
}

// detectDriftViaKubectl uses kubectl diff to detect drift
func (h *GitOpsHandlers) detectDriftViaKubectl(ctx context.Context, req DetectDriftRequest) (*DetectDriftResponse, error) {
	// SECURITY: Validate K8s name params before passing to kubectl CLI
	for field, val := range map[string]string{"cluster": req.Cluster, "namespace": req.Namespace} {
		if err := validateK8sName(val, field); err != nil {
			return nil, fmt.Errorf("invalid %s: %w", field, err)
		}
	}

	// Clone the repo to a temp directory
	tempDir, err := cloneRepo(ctx, req.RepoURL, req.Branch)
	if err != nil {
		return nil, fmt.Errorf("failed to clone repo: %w", err)
	}
	defer cleanupTempDir(tempDir)

	// Build the manifest path
	manifestPath := tempDir
	if req.Path != "" {
		manifestPath = fmt.Sprintf("%s/%s", tempDir, strings.TrimPrefix(req.Path, "/"))
	}

	// Check if this is a kustomize directory - use -k instead of -f
	fileFlag := "-f"
	if isKustomizeDir(manifestPath) {
		fileFlag = "-k"
	}

	// Build kubectl diff command
	args := []string{"diff", fileFlag, manifestPath}
	if req.Namespace != "" {
		args = append(args, "-n", req.Namespace)
	}
	if req.Cluster != "" {
		args = append(args, "--context", req.Cluster)
	}

	cmd := exec.CommandContext(ctx, "kubectl", args...)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	// kubectl diff returns exit code 1 if there are differences
	err = cmd.Run()
	diffOutput := stdout.String()

	response := &DetectDriftResponse{
		Source:     "kubectl",
		RawDiff:    diffOutput,
		TokensUsed: 0, // No AI tokens used for kubectl
	}

	// Exit code 0 = no diff, 1 = diff exists, other = error
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			if exitErr.ExitCode() == 1 {
				// Diff exists - parse it
				response.Drifted = true
				response.Resources = parseDiffOutput(diffOutput, req.Namespace)
			} else {
				return nil, fmt.Errorf("kubectl diff failed: %s", stderr.String())
			}
		} else {
			return nil, fmt.Errorf("kubectl diff failed: %w", err)
		}
	}

	return response, nil
}

// Sync applies manifests from git to the cluster
func (h *GitOpsHandlers) Sync(c *fiber.Ctx) error {
	var req SyncRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid request body"})
	}

	if req.RepoURL == "" {
		return c.Status(400).JSON(fiber.Map{"error": "repoUrl is required"})
	}

	ctx, cancel := context.WithTimeout(c.Context(), gitopsDefaultTimeout)
	defer cancel()

	// Try MCP bridge first
	if h.bridge != nil {
		result, err := h.syncViaMCP(ctx, req)
		if err == nil {
			return c.JSON(result)
		}
		log.Printf("MCP sync failed, falling back to kubectl: %v", err)
	}

	// Fall back to kubectl apply
	result, err := h.syncViaKubectl(ctx, req)
	if err != nil {
		return handleK8sError(c, err)
	}

	return c.JSON(result)
}

// syncViaMCP uses kubestellar-deploy for sync
func (h *GitOpsHandlers) syncViaMCP(ctx context.Context, req SyncRequest) (*SyncResponse, error) {
	args := map[string]interface{}{
		"repo_url": req.RepoURL,
		"path":     req.Path,
	}
	if req.Branch != "" {
		args["branch"] = req.Branch
	}
	if req.Cluster != "" {
		args["cluster"] = req.Cluster
	}
	if req.Namespace != "" {
		args["namespace"] = req.Namespace
	}
	if req.DryRun {
		args["dry_run"] = true
	}

	result, err := h.bridge.CallDeployTool(ctx, "apply_manifests", args)
	if err != nil {
		return nil, err
	}

	response := &SyncResponse{
		Source:     "mcp",
		TokensUsed: 200,
	}

	if result.IsError {
		response.Success = false
		if len(result.Content) > 0 {
			response.Message = result.Content[0].Text
			response.Errors = []string{result.Content[0].Text}
		}
		return response, nil
	}

	// Parse content
	if len(result.Content) > 0 {
		text := result.Content[0].Text
		response.Message = text
		response.Success = true

		// Try to parse as JSON
		var parsed map[string]interface{}
		if err := json.Unmarshal([]byte(text), &parsed); err == nil {
			if success, ok := parsed["success"].(bool); ok {
				response.Success = success
			}
			if message, ok := parsed["message"].(string); ok {
				response.Message = message
			}
		}
	}

	return response, nil
}

// syncViaKubectl uses kubectl apply
func (h *GitOpsHandlers) syncViaKubectl(ctx context.Context, req SyncRequest) (*SyncResponse, error) {
	// SECURITY: Validate K8s name params before passing to kubectl CLI
	for field, val := range map[string]string{"cluster": req.Cluster, "namespace": req.Namespace} {
		if err := validateK8sName(val, field); err != nil {
			return nil, fmt.Errorf("invalid %s: %w", field, err)
		}
	}

	// Clone the repo
	tempDir, err := cloneRepo(ctx, req.RepoURL, req.Branch)
	if err != nil {
		return nil, fmt.Errorf("failed to clone repo: %w", err)
	}
	defer cleanupTempDir(tempDir)

	// Build manifest path
	manifestPath := tempDir
	if req.Path != "" {
		manifestPath = fmt.Sprintf("%s/%s", tempDir, strings.TrimPrefix(req.Path, "/"))
	}

	// Check if this is a kustomize directory - use -k instead of -f
	fileFlag := "-f"
	if isKustomizeDir(manifestPath) {
		fileFlag = "-k"
	}

	// Build kubectl apply command
	args := []string{"apply", fileFlag, manifestPath}
	if req.Namespace != "" {
		args = append(args, "-n", req.Namespace)
	}
	if req.Cluster != "" {
		args = append(args, "--context", req.Cluster)
	}
	if req.DryRun {
		args = append(args, "--dry-run=client")
	}

	cmd := exec.CommandContext(ctx, "kubectl", args...)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err = cmd.Run()
	if err != nil {
		return &SyncResponse{
			Success: false,
			Message: stderr.String(),
			Source:  "kubectl",
			Errors:  []string{stderr.String()},
		}, nil
	}

	// Parse applied resources from output
	applied := parseApplyOutput(stdout.String())

	return &SyncResponse{
		Success:    true,
		Message:    "Successfully applied manifests",
		Applied:    applied,
		Source:     "kubectl",
		TokensUsed: 0,
	}, nil
}

// Helper functions

func getString(m map[string]interface{}, key string) string {
	if v, ok := m[key].(string); ok {
		return v
	}
	return ""
}

// gitOpsTempDirPrefix is the required prefix for all GitOps temp directories
const gitOpsTempDirPrefix = "/tmp/gitops-"

// maxK8sNameLen is the maximum allowed length for Kubernetes resource names (RFC 1123)
const maxK8sNameLen = 253

// maxHelmChartLen is the maximum allowed length for a Helm chart reference
const maxHelmChartLen = 512

// validateK8sName validates a Kubernetes-style name (cluster, namespace, release, pod).
// SECURITY: Prevents flag injection and shell metacharacters in CLI args.
func validateK8sName(name, field string) error {
	if name == "" {
		return nil // Empty is OK — callers handle required-field checks separately
	}
	if len(name) > maxK8sNameLen {
		return fmt.Errorf("%s exceeds maximum length of %d", field, maxK8sNameLen)
	}
	if strings.HasPrefix(name, "-") {
		return fmt.Errorf("%s must not start with '-'", field)
	}
	for _, ch := range name {
		if !((ch >= 'a' && ch <= 'z') ||
			(ch >= 'A' && ch <= 'Z') ||
			(ch >= '0' && ch <= '9') ||
			ch == '-' || ch == '_' || ch == '.') {
			return fmt.Errorf("%s contains invalid character: %c", field, ch)
		}
	}
	return nil
}

// validateHelmChart validates a Helm chart reference (e.g. "bitnami/nginx", "oci://...").
// SECURITY: Prevents flag injection via chart parameter.
func validateHelmChart(chart string) error {
	if chart == "" {
		return fmt.Errorf("chart is required")
	}
	if len(chart) > maxHelmChartLen {
		return fmt.Errorf("chart reference exceeds maximum length of %d", maxHelmChartLen)
	}
	if strings.HasPrefix(chart, "-") {
		return fmt.Errorf("chart must not start with '-'")
	}
	// Allow alphanumeric, -, _, ., /, : (for oci:// and repo/chart)
	for _, ch := range chart {
		if !((ch >= 'a' && ch <= 'z') ||
			(ch >= 'A' && ch <= 'Z') ||
			(ch >= '0' && ch <= '9') ||
			ch == '-' || ch == '_' || ch == '.' || ch == '/' || ch == ':') {
			return fmt.Errorf("chart contains invalid character: %c", ch)
		}
	}
	return nil
}

// validateHelmVersion validates a Helm chart version string.
func validateHelmVersion(version string) error {
	if version == "" {
		return nil
	}
	if strings.HasPrefix(version, "-") {
		return fmt.Errorf("version must not start with '-'")
	}
	for _, ch := range version {
		if !((ch >= 'a' && ch <= 'z') ||
			(ch >= 'A' && ch <= 'Z') ||
			(ch >= '0' && ch <= '9') ||
			ch == '-' || ch == '_' || ch == '.' || ch == '+') {
			return fmt.Errorf("version contains invalid character: %c", ch)
		}
	}
	return nil
}

// validateRepoURL validates that a repository URL is safe to clone
// SECURITY: Prevents command injection and malformed URLs
func validateRepoURL(repoURL string) error {
	if repoURL == "" {
		return fmt.Errorf("repository URL is required")
	}

	// Only allow https:// and git@ (SSH) URLs
	if !strings.HasPrefix(repoURL, "https://") && !strings.HasPrefix(repoURL, "git@") {
		return fmt.Errorf("only HTTPS and SSH git URLs are allowed")
	}

	// Block URLs with shell metacharacters
	dangerousChars := []string{";", "|", "&", "$", "`", "(", ")", "{", "}", "<", ">", "\\", "'", "\"", "\n", "\r"}
	for _, char := range dangerousChars {
		if strings.Contains(repoURL, char) {
			return fmt.Errorf("invalid characters in repository URL")
		}
	}

	// Block file:// URLs which could be used for local file access
	if strings.Contains(strings.ToLower(repoURL), "file://") {
		return fmt.Errorf("file:// URLs are not allowed")
	}

	return nil
}

// validateBranchName validates that a branch name is safe
func validateBranchName(branch string) error {
	if branch == "" {
		return nil // Empty branch is OK - git will use default
	}

	// Only allow alphanumeric, -, _, /, .
	for _, char := range branch {
		if !((char >= 'a' && char <= 'z') ||
			(char >= 'A' && char <= 'Z') ||
			(char >= '0' && char <= '9') ||
			char == '-' || char == '_' || char == '/' || char == '.') {
			return fmt.Errorf("invalid character in branch name: %c", char)
		}
	}

	// Block dangerous patterns
	if strings.HasPrefix(branch, "-") {
		return fmt.Errorf("branch name cannot start with '-'")
	}
	if strings.Contains(branch, "..") {
		return fmt.Errorf("branch name cannot contain '..'")
	}

	return nil
}

func cloneRepo(ctx context.Context, repoURL, branch string) (string, error) {
	// SECURITY: Validate inputs before executing
	if err := validateRepoURL(repoURL); err != nil {
		return "", fmt.Errorf("invalid repository URL: %w", err)
	}
	if err := validateBranchName(branch); err != nil {
		return "", fmt.Errorf("invalid branch name: %w", err)
	}

	tempDir := fmt.Sprintf("%s%d", gitOpsTempDirPrefix, time.Now().UnixNano())

	args := []string{"clone", "--depth", "1"}
	if branch != "" {
		args = append(args, "-b", branch)
	}
	args = append(args, repoURL, tempDir)

	cmd := exec.CommandContext(ctx, "git", args...)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("git clone failed: %s", stderr.String())
	}

	return tempDir, nil
}

// isKustomizeDir checks if a directory contains kustomization.yaml or kustomization.yml
func isKustomizeDir(path string) bool {
	cmd := exec.Command("test", "-f", path+"/kustomization.yaml")
	if cmd.Run() == nil {
		return true
	}
	cmd = exec.Command("test", "-f", path+"/kustomization.yml")
	return cmd.Run() == nil
}

// cleanupTempDir safely removes a temporary directory
// SECURITY: Validates the path is within expected temp directory to prevent path traversal
func cleanupTempDir(dir string) {
	// Only remove directories that match our expected pattern
	if !strings.HasPrefix(dir, gitOpsTempDirPrefix) {
		log.Printf("SECURITY: Refused to delete directory outside gitops temp prefix: %s", dir)
		return
	}

	// Additional validation: ensure no path traversal
	if strings.Contains(dir, "..") {
		log.Printf("SECURITY: Refused to delete directory with path traversal: %s", dir)
		return
	}

	// Use os.RemoveAll instead of shell command for safety
	if err := os.RemoveAll(dir); err != nil {
		log.Printf("Warning: Failed to cleanup temp directory %s: %v", dir, err)
	}
}

func parseDiffOutput(output, namespace string) []DriftedResource {
	resources := make([]DriftedResource, 0)
	resourceMap := make(map[string]*DriftedResource) // key: kind/name

	lines := strings.Split(output, "\n")
	var currentKind, currentName string

	for _, line := range lines {
		// Strip diff prefix (+/-) for parsing YAML content
		cleanLine := line
		if strings.HasPrefix(line, "+") && !strings.HasPrefix(line, "+++") {
			cleanLine = strings.TrimPrefix(line, "+")
		} else if strings.HasPrefix(line, "-") && !strings.HasPrefix(line, "---") {
			cleanLine = strings.TrimPrefix(line, "-")
		}
		cleanLine = strings.TrimSpace(cleanLine)

		// Parse kind from YAML
		if strings.HasPrefix(cleanLine, "kind:") {
			parts := strings.SplitN(cleanLine, ":", 2)
			if len(parts) >= 2 {
				currentKind = strings.TrimSpace(parts[1])
			}
		}

		// Parse name from YAML metadata
		if strings.HasPrefix(cleanLine, "name:") && currentKind != "" {
			parts := strings.SplitN(cleanLine, ":", 2)
			if len(parts) >= 2 {
				currentName = strings.TrimSpace(parts[1])
				// Create or get resource entry
				key := currentKind + "/" + currentName
				if _, exists := resourceMap[key]; !exists {
					resourceMap[key] = &DriftedResource{
						Kind:      currentKind,
						Name:      currentName,
						Namespace: namespace,
					}
				}
			}
		}

		// Capture meaningful changes
		if currentKind != "" && currentName != "" {
			key := currentKind + "/" + currentName
			if r, exists := resourceMap[key]; exists {
				if strings.HasPrefix(line, "-") && !strings.HasPrefix(line, "---") {
					lastChange := strings.TrimSpace(strings.TrimPrefix(line, "-"))
					if r.ClusterValue == "" && lastChange != "" {
						r.ClusterValue = truncateValue(lastChange)
					}
				}
				if strings.HasPrefix(line, "+") && !strings.HasPrefix(line, "+++") {
					change := strings.TrimSpace(strings.TrimPrefix(line, "+"))
					if r.GitValue == "" && change != "" {
						r.GitValue = truncateValue(change)
					}
				}
			}
		}

		// Reset on new diff file
		if strings.HasPrefix(line, "diff ") {
			currentKind = ""
			currentName = ""
		}
	}

	// Convert map to slice
	for _, r := range resourceMap {
		if r.Name != "" {
			resources = append(resources, *r)
		}
	}

	return resources
}

func truncateValue(s string) string {
	if len(s) > 60 {
		return s[:57] + "..."
	}
	return s
}

func parseApplyOutput(output string) []string {
	applied := make([]string, 0)
	lines := strings.Split(output, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line != "" && (strings.Contains(line, "created") ||
			strings.Contains(line, "configured") ||
			strings.Contains(line, "unchanged")) {
			applied = append(applied, line)
		}
	}
	return applied
}

// getDemoDrifts returns demo drift data for testing
func getDemoDrifts(cluster, namespace string) []GitOpsDrift {
	allDrifts := []GitOpsDrift{
		{
			Resource:   "api-gateway",
			Namespace:  "production",
			Cluster:    "prod-east",
			Kind:       "Deployment",
			DriftType:  "modified",
			GitVersion: "v2.4.0",
			Details:    "Image tag changed from v2.4.0 to v2.4.1-hotfix",
			Severity:   "medium",
		},
		{
			Resource:   "config-secret",
			Namespace:  "production",
			Cluster:    "prod-east",
			Kind:       "Secret",
			DriftType:  "modified",
			GitVersion: "abc123",
			Details:    "Secret data modified manually",
			Severity:   "high",
		},
		{
			Resource:   "debug-pod",
			Namespace:  "default",
			Cluster:    "staging",
			Kind:       "Pod",
			DriftType:  "added",
			GitVersion: "-",
			Details:    "Resource exists in cluster but not in Git",
			Severity:   "low",
		},
		{
			Resource:   "legacy-service",
			Namespace:  "production",
			Cluster:    "prod-west",
			Kind:       "Service",
			DriftType:  "deleted",
			GitVersion: "def456",
			Details:    "Resource in Git but missing from cluster",
			Severity:   "high",
		},
		{
			Resource:   "worker-hpa",
			Namespace:  "batch",
			Cluster:    "vllm-d",
			Kind:       "HorizontalPodAutoscaler",
			DriftType:  "modified",
			GitVersion: "main",
			Details:    "MinReplicas changed from 2 to 5",
			Severity:   "medium",
		},
	}

	// Filter by cluster and namespace if provided
	if cluster == "" && namespace == "" {
		return allDrifts
	}

	filtered := make([]GitOpsDrift, 0)
	for _, d := range allDrifts {
		if (cluster == "" || d.Cluster == cluster) && (namespace == "" || d.Namespace == namespace) {
			filtered = append(filtered, d)
		}
	}
	return filtered
}

// ListHelmHistory returns the history of a specific Helm release
func (h *GitOpsHandlers) ListHelmHistory(c *fiber.Ctx) error {
	cluster := c.Query("cluster")
	release := c.Query("release")
	namespace := c.Query("namespace")

	if release == "" {
		// Return empty history instead of 400 — callers may query before
		// their data context has finished hydrating (e.g. on React mount).
		return c.JSON(fiber.Map{"history": []HelmHistoryEntry{}})
	}

	// SECURITY: Validate all user-supplied params before passing to helm CLI
	for field, val := range map[string]string{"cluster": cluster, "release": release, "namespace": namespace} {
		if err := validateK8sName(val, field); err != nil {
			return c.Status(400).JSON(fiber.Map{"error": err.Error()})
		}
	}

	// Note: helm history doesn't support -A (all namespaces) flag
	// If namespace not provided, helm will search in the default namespace
	// The frontend should pass the namespace from the release data
	args := []string{"history", release, "--output", "json", "--max", "20"}
	if namespace != "" {
		args = append(args, "-n", namespace)
	}
	if cluster != "" {
		args = append(args, "--kube-context", cluster)
	}

	ctx, cancel := context.WithTimeout(c.Context(), gitopsDefaultTimeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, "helm", args...)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		log.Printf("helm history failed for release %s: %v, stderr: %s", release, err, stderr.String())
		return c.JSON(fiber.Map{"history": []HelmHistoryEntry{}, "error": stderr.String()})
	}

	history := make([]HelmHistoryEntry, 0)
	if err := json.Unmarshal(stdout.Bytes(), &history); err != nil {
		log.Printf("failed to parse helm history output for release %s: %v", release, err)
		return c.JSON(fiber.Map{"history": []HelmHistoryEntry{}, "error": "failed to parse history"})
	}

	return c.JSON(fiber.Map{"history": history})
}

// GetHelmValues returns the values of a specific Helm release
func (h *GitOpsHandlers) GetHelmValues(c *fiber.Ctx) error {
	cluster := c.Query("cluster")
	release := c.Query("release")
	namespace := c.Query("namespace")

	if release == "" {
		return c.Status(400).JSON(fiber.Map{"error": "release parameter is required"})
	}

	// SECURITY: Validate all user-supplied params before passing to helm CLI
	for field, val := range map[string]string{"cluster": cluster, "release": release, "namespace": namespace} {
		if err := validateK8sName(val, field); err != nil {
			return c.Status(400).JSON(fiber.Map{"error": err.Error()})
		}
	}

	// If namespace not provided, look it up from helm list (with timeout)
	if namespace == "" {
		lookupCtx, lookupCancel := context.WithTimeout(c.Context(), gitopsLookupTimeout)
		defer lookupCancel()
		namespace = h.findReleaseNamespace(lookupCtx, cluster, release)
	}

	args := []string{"get", "values", release, "--output", "json"}
	if namespace != "" {
		args = append(args, "-n", namespace)
	}
	if cluster != "" {
		args = append(args, "--kube-context", cluster)
	}

	ctx, cancel := context.WithTimeout(c.Context(), gitopsDefaultTimeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, "helm", args...)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		log.Printf("helm get values failed for release %s: %v, stderr: %s", release, err, stderr.String())
		return c.JSON(fiber.Map{"values": map[string]interface{}{}, "error": stderr.String()})
	}

	var values map[string]interface{}
	if err := json.Unmarshal(stdout.Bytes(), &values); err != nil {
		// If JSON fails, return as raw YAML string
		return c.JSON(fiber.Map{"values": stdout.String(), "format": "yaml"})
	}

	// Handle null (no custom values) - return empty object instead
	if values == nil {
		values = map[string]interface{}{}
	}

	return c.JSON(fiber.Map{"values": values, "format": "json"})
}

// findReleaseNamespace finds the namespace for a release by listing all releases
func (h *GitOpsHandlers) findReleaseNamespace(ctx context.Context, cluster, releaseName string) string {
	releases := h.getHelmReleasesForCluster(ctx, cluster)
	for _, r := range releases {
		if r.Name == releaseName {
			return r.Namespace
		}
	}
	return ""
}

// ============================================================================
// Helm Write Operations
// ============================================================================

/** helmWriteTimeout is the timeout for helm write operations (rollback, uninstall, upgrade). */
const helmWriteTimeout = 60 * time.Second

// HelmRollbackRequest is the request body for rolling back a release
type HelmRollbackRequest struct {
	Release   string `json:"release"`
	Namespace string `json:"namespace"`
	Cluster   string `json:"cluster"`
	Revision  int    `json:"revision"`
}

// HelmUninstallRequest is the request body for uninstalling a release
type HelmUninstallRequest struct {
	Release   string `json:"release"`
	Namespace string `json:"namespace"`
	Cluster   string `json:"cluster"`
}

// HelmUpgradeRequest is the request body for upgrading a release
type HelmUpgradeRequest struct {
	Release   string `json:"release"`
	Namespace string `json:"namespace"`
	Cluster   string `json:"cluster"`
	Chart     string `json:"chart"`
	Version   string `json:"version,omitempty"`
	Values    string `json:"values,omitempty"` // YAML string of override values
	ReuseValues bool `json:"reuseValues,omitempty"`
}

// RollbackHelmRelease rolls back a Helm release to a specific revision
func (h *GitOpsHandlers) RollbackHelmRelease(c *fiber.Ctx) error {
	var req HelmRollbackRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid request body"})
	}

	if req.Release == "" || req.Namespace == "" {
		return c.Status(400).JSON(fiber.Map{"error": "release and namespace are required"})
	}
	if req.Revision <= 0 {
		return c.Status(400).JSON(fiber.Map{"error": "revision must be a positive integer"})
	}

	// SECURITY: Validate all user-supplied params before passing to helm CLI
	for field, val := range map[string]string{"cluster": req.Cluster, "release": req.Release, "namespace": req.Namespace} {
		if err := validateK8sName(val, field); err != nil {
			return c.Status(400).JSON(fiber.Map{"error": err.Error()})
		}
	}

	args := []string{"rollback", req.Release, fmt.Sprintf("%d", req.Revision), "-n", req.Namespace}
	if req.Cluster != "" {
		args = append(args, "--kube-context", req.Cluster)
	}

	ctx, cancel := context.WithTimeout(c.Context(), helmWriteTimeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, "helm", args...)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	log.Printf("helm rollback: %s to revision %d in %s/%s", req.Release, req.Revision, req.Cluster, req.Namespace)

	if err := cmd.Run(); err != nil {
		log.Printf("helm rollback failed for %s: %v, stderr: %s", req.Release, err, stderr.String())
		return c.Status(500).JSON(fiber.Map{
			"error":  "rollback failed",
			"detail": stderr.String(),
		})
	}

	log.Printf("helm rollback succeeded: %s to revision %d", req.Release, req.Revision)
	return c.JSON(fiber.Map{
		"success": true,
		"message": fmt.Sprintf("Rolled back %s to revision %d", req.Release, req.Revision),
		"output":  stdout.String(),
	})
}

// UninstallHelmRelease uninstalls a Helm release
func (h *GitOpsHandlers) UninstallHelmRelease(c *fiber.Ctx) error {
	var req HelmUninstallRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid request body"})
	}

	if req.Release == "" || req.Namespace == "" {
		return c.Status(400).JSON(fiber.Map{"error": "release and namespace are required"})
	}

	// SECURITY: Validate all user-supplied params before passing to helm CLI
	for field, val := range map[string]string{"cluster": req.Cluster, "release": req.Release, "namespace": req.Namespace} {
		if err := validateK8sName(val, field); err != nil {
			return c.Status(400).JSON(fiber.Map{"error": err.Error()})
		}
	}

	args := []string{"uninstall", req.Release, "-n", req.Namespace}
	if req.Cluster != "" {
		args = append(args, "--kube-context", req.Cluster)
	}

	ctx, cancel := context.WithTimeout(c.Context(), helmWriteTimeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, "helm", args...)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	log.Printf("helm uninstall: %s in %s/%s", req.Release, req.Cluster, req.Namespace)

	if err := cmd.Run(); err != nil {
		log.Printf("helm uninstall failed for %s: %v, stderr: %s", req.Release, err, stderr.String())
		return c.Status(500).JSON(fiber.Map{
			"error":  "uninstall failed",
			"detail": stderr.String(),
		})
	}

	log.Printf("helm uninstall succeeded: %s", req.Release)
	return c.JSON(fiber.Map{
		"success": true,
		"message": fmt.Sprintf("Uninstalled release %s", req.Release),
		"output":  stdout.String(),
	})
}

// UpgradeHelmRelease upgrades a Helm release
func (h *GitOpsHandlers) UpgradeHelmRelease(c *fiber.Ctx) error {
	var req HelmUpgradeRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid request body"})
	}

	if req.Release == "" || req.Namespace == "" || req.Chart == "" {
		return c.Status(400).JSON(fiber.Map{"error": "release, namespace, and chart are required"})
	}

	// SECURITY: Validate all user-supplied params before passing to helm CLI
	for field, val := range map[string]string{"cluster": req.Cluster, "release": req.Release, "namespace": req.Namespace} {
		if err := validateK8sName(val, field); err != nil {
			return c.Status(400).JSON(fiber.Map{"error": err.Error()})
		}
	}
	if err := validateHelmChart(req.Chart); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": err.Error()})
	}
	if err := validateHelmVersion(req.Version); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": err.Error()})
	}

	args := []string{"upgrade", req.Release, req.Chart, "-n", req.Namespace}
	if req.Version != "" {
		args = append(args, "--version", req.Version)
	}
	if req.ReuseValues {
		args = append(args, "--reuse-values")
	}
	if req.Cluster != "" {
		args = append(args, "--kube-context", req.Cluster)
	}

	ctx, cancel := context.WithTimeout(c.Context(), helmWriteTimeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, "helm", args...)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	// If values provided, write to temp file and pass via -f
	if req.Values != "" {
		tmpFile, err := os.CreateTemp("", "helm-values-*.yaml")
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": "failed to create temp values file"})
		}
		defer os.Remove(tmpFile.Name())

		if _, err := tmpFile.WriteString(req.Values); err != nil {
			tmpFile.Close()
			return c.Status(500).JSON(fiber.Map{"error": "failed to write values"})
		}
		tmpFile.Close()

		args = append(args, "-f", tmpFile.Name())
		// Rebuild command with values file
		cmd = exec.CommandContext(ctx, "helm", args...)
		cmd.Stdout = &stdout
		cmd.Stderr = &stderr
	}

	log.Printf("helm upgrade: %s with chart %s in %s/%s", req.Release, req.Chart, req.Cluster, req.Namespace)

	if err := cmd.Run(); err != nil {
		log.Printf("helm upgrade failed for %s: %v, stderr: %s", req.Release, err, stderr.String())
		return c.Status(500).JSON(fiber.Map{
			"error":  "upgrade failed",
			"detail": stderr.String(),
		})
	}

	log.Printf("helm upgrade succeeded: %s", req.Release)
	return c.JSON(fiber.Map{
		"success": true,
		"message": fmt.Sprintf("Upgraded release %s", req.Release),
		"output":  stdout.String(),
	})
}

// ============================================================================
// ArgoCD Endpoints
// ============================================================================

// argocdQueryTimeout is the timeout for querying ArgoCD Application CRDs across clusters
const argocdQueryTimeout = 15 * time.Second

// ListArgoApplications returns all ArgoCD Application resources across all clusters.
// GET /api/gitops/argocd/applications
// Query params: ?cluster=<name> (optional, filter by cluster)
func (h *GitOpsHandlers) ListArgoApplications(c *fiber.Ctx) error {
	if h.k8sClient == nil {
		return c.Status(503).JSON(fiber.Map{
			"error":   "Kubernetes client not configured",
			"isDemoData": true,
		})
	}

	ctx, cancel := context.WithTimeout(c.Context(), argocdQueryTimeout)
	defer cancel()

	appList, err := h.k8sClient.ListArgoApplications(ctx)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{
			"error":   fmt.Sprintf("Failed to list ArgoCD applications: %v", err),
			"isDemoData": true,
		})
	}

	// Optional cluster filter
	clusterFilter := c.Query("cluster")
	if clusterFilter != "" {
		filtered := make([]interface{}, 0)
		for _, app := range appList.Items {
			if app.Cluster == clusterFilter {
				filtered = append(filtered, app)
			}
		}
		return c.JSON(fiber.Map{
			"items":      filtered,
			"totalCount": len(filtered),
			"isDemoData": false,
		})
	}

	return c.JSON(fiber.Map{
		"items":      appList.Items,
		"totalCount": appList.TotalCount,
		"isDemoData": false,
	})
}

// GetArgoHealthSummary returns aggregated health status counts for all ArgoCD applications.
// GET /api/gitops/argocd/health
func (h *GitOpsHandlers) GetArgoHealthSummary(c *fiber.Ctx) error {
	if h.k8sClient == nil {
		return c.Status(503).JSON(fiber.Map{
			"error":   "Kubernetes client not configured",
			"isDemoData": true,
		})
	}

	ctx, cancel := context.WithTimeout(c.Context(), argocdQueryTimeout)
	defer cancel()

	appList, err := h.k8sClient.ListArgoApplications(ctx)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{
			"error":   fmt.Sprintf("Failed to list ArgoCD applications: %v", err),
			"isDemoData": true,
		})
	}

	// Aggregate health statuses
	summary := fiber.Map{
		"healthy":     0,
		"degraded":    0,
		"progressing": 0,
		"missing":     0,
		"unknown":     0,
	}

	for _, app := range appList.Items {
		switch app.HealthStatus {
		case "Healthy":
			summary["healthy"] = summary["healthy"].(int) + 1
		case "Degraded":
			summary["degraded"] = summary["degraded"].(int) + 1
		case "Progressing":
			summary["progressing"] = summary["progressing"].(int) + 1
		case "Missing":
			summary["missing"] = summary["missing"].(int) + 1
		default:
			summary["unknown"] = summary["unknown"].(int) + 1
		}
	}

	return c.JSON(fiber.Map{
		"stats":      summary,
		"isDemoData": false,
	})
}

// GetArgoSyncSummary returns aggregated sync status counts for all ArgoCD applications.
// GET /api/gitops/argocd/sync
func (h *GitOpsHandlers) GetArgoSyncSummary(c *fiber.Ctx) error {
	if h.k8sClient == nil {
		return c.Status(503).JSON(fiber.Map{
			"error":   "Kubernetes client not configured",
			"isDemoData": true,
		})
	}

	ctx, cancel := context.WithTimeout(c.Context(), argocdQueryTimeout)
	defer cancel()

	appList, err := h.k8sClient.ListArgoApplications(ctx)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{
			"error":   fmt.Sprintf("Failed to list ArgoCD applications: %v", err),
			"isDemoData": true,
		})
	}

	// Aggregate sync statuses
	summary := fiber.Map{
		"synced":    0,
		"outOfSync": 0,
		"unknown":   0,
	}

	for _, app := range appList.Items {
		switch app.SyncStatus {
		case "Synced":
			summary["synced"] = summary["synced"].(int) + 1
		case "OutOfSync":
			summary["outOfSync"] = summary["outOfSync"].(int) + 1
		default:
			summary["unknown"] = summary["unknown"].(int) + 1
		}
	}

	return c.JSON(fiber.Map{
		"stats":      summary,
		"isDemoData": false,
	})
}

// TriggerArgoSync triggers a sync operation for an ArgoCD Application.
// This is a best-effort operation that patches the Application's operation field.
// POST /api/gitops/argocd/sync
func (h *GitOpsHandlers) TriggerArgoSync(c *fiber.Ctx) error {
	if h.k8sClient == nil {
		return c.Status(503).JSON(fiber.Map{
			"error":   "Kubernetes client not configured",
			"success": false,
		})
	}

	var req struct {
		AppName   string `json:"appName"`
		Namespace string `json:"namespace"`
		Cluster   string `json:"cluster"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{
			"error":   "Invalid request body",
			"success": false,
		})
	}

	if req.AppName == "" || req.Cluster == "" {
		return c.Status(400).JSON(fiber.Map{
			"error":   "appName and cluster are required",
			"success": false,
		})
	}

	// Default namespace for ArgoCD applications
	namespace := req.Namespace
	if namespace == "" {
		namespace = "argocd"
	}

	log.Printf("[ArgoCD] Triggering sync for %s/%s on cluster %s", namespace, req.AppName, req.Cluster)

	// Use argocd CLI if available, otherwise try kubectl annotation refresh
	if _, err := exec.LookPath("argocd"); err == nil {
		cmd := exec.CommandContext(c.Context(), "argocd", "app", "sync", req.AppName,
			"--namespace", namespace,
			"--prune",
			"--timeout", "30",
		)
		output, err := cmd.CombinedOutput()
		if err != nil {
			log.Printf("[ArgoCD] CLI sync failed: %v, output: %s", err, string(output))
			return c.Status(500).JSON(fiber.Map{
				"error":   fmt.Sprintf("ArgoCD sync failed: %v", err),
				"success": false,
			})
		}
		return c.JSON(fiber.Map{
			"success": true,
			"message": "Sync triggered via ArgoCD CLI",
		})
	}

	// Fallback: annotate the Application to trigger a refresh
	dynamicClient, err := h.k8sClient.GetDynamicClient(req.Cluster)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{
			"error":   fmt.Sprintf("Failed to get dynamic client: %v", err),
			"success": false,
		})
	}

	// Fetch the current Application to patch it
	ctx, cancel := context.WithTimeout(c.Context(), argocdQueryTimeout)
	defer cancel()

	app, err := dynamicClient.Resource(v1alpha1.ArgoApplicationGVR).Namespace(namespace).Get(ctx, req.AppName, metav1.GetOptions{})
	if err != nil {
		return c.Status(404).JSON(fiber.Map{
			"error":   fmt.Sprintf("Application %s not found in %s/%s: %v", req.AppName, req.Cluster, namespace, err),
			"success": false,
		})
	}

	// Set the refresh annotation to trigger ArgoCD's reconciliation
	annotations := app.GetAnnotations()
	if annotations == nil {
		annotations = make(map[string]string)
	}
	annotations["argocd.argoproj.io/refresh"] = "hard"
	app.SetAnnotations(annotations)

	// Also set the operation field to trigger a sync
	content := app.UnstructuredContent()
	operation := map[string]interface{}{
		"initiatedBy": map[string]interface{}{
			"username":  "kubestellar-console",
			"automated": false,
		},
		"sync": map[string]interface{}{
			"prune": true,
		},
	}
	content["operation"] = operation
	app.SetUnstructuredContent(content)

	_, err = dynamicClient.Resource(v1alpha1.ArgoApplicationGVR).Namespace(namespace).Update(ctx, app, metav1.UpdateOptions{})
	if err != nil {
		return c.Status(500).JSON(fiber.Map{
			"error":   fmt.Sprintf("Failed to trigger sync: %v", err),
			"success": false,
		})
	}

	return c.JSON(fiber.Map{
		"success": true,
		"message": "Sync triggered via Application resource annotation",
	})
}
