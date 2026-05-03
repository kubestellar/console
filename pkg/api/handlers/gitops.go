package handlers

import (
	"bytes"
	"compress/gzip"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"os/exec"
	"regexp"
	"strconv"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
	"golang.org/x/sync/singleflight"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/mcp"
	"github.com/kubestellar/console/pkg/store"
)

// Maximum number of concurrent helm/kubectl subprocesses across all handlers.
// Each helm ls or kubectl command can use 100-300MB; with 18 clusters running
// unbounded, the process was OOM-killed at ~3.6GB.
const maxConcurrentSubprocesses = 4

// Semaphore channel to limit concurrent subprocess fan-outs
var subprocessSem = make(chan struct{}, maxConcurrentSubprocesses)

// argoInsecureWarning ensures the TLS skip warning is logged only once per process.
var argoInsecureWarning sync.Once

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

// driftCacheTTL bounds how long a DetectDrift result stays in the shared
// cache feeding ListDrifts. Long enough to be useful across a dashboard
// render cycle, short enough that manual refreshes (#5952) actually see
// fresh data rather than a stale repeat.
const driftCacheTTL = 30 * time.Second

// driftCacheEntry is a single cached drift-detection result keyed by
// repo/path/cluster/namespace.
type driftCacheEntry struct {
	drifts   []GitOpsDrift
	detected time.Time
}

// GitOpsHandlers handles GitOps-related API endpoints
type GitOpsHandlers struct {
	bridge    *mcp.Bridge
	k8sClient *k8s.MultiClusterClient
	// userStore is consulted by the shared requireEditorOrAdmin /
	// requireViewerOrAbove helpers to enforce RBAC on GitOps endpoints
	// (#6022). May be nil in dev/demo mode or in unit tests that don't
	// exercise RBAC; in that case the check is a no-op to preserve existing
	// test ergonomics.
	userStore store.Store

	// driftCache memoises recent drift results so ListDrifts can return
	// something meaningful (#5950). Populated by DetectDrift.
	driftCacheMu sync.RWMutex
	driftCache   map[string]driftCacheEntry
}

// NewGitOpsHandlers creates a new GitOps handlers instance.
//
// userStore is used to enforce editor-or-admin on mutating GitOps endpoints
// (sync, helm mutations, argocd sync) and viewer-or-above on drift detection
// (#6022). Pass nil to skip role checks — this is intended for dev/demo mode
// and unit tests that are not exercising RBAC.
func NewGitOpsHandlers(bridge *mcp.Bridge, k8sClient *k8s.MultiClusterClient, userStore store.Store) *GitOpsHandlers {
	return &GitOpsHandlers{
		bridge:     bridge,
		k8sClient:  k8sClient,
		userStore:  userStore,
		driftCache: make(map[string]driftCacheEntry),
	}
}

// RBAC for GitOps endpoints is enforced via the shared helpers in
// auth_helpers.go (requireEditorOrAdmin / requireViewerOrAbove). The earlier
// admin-only helper was removed in #6022 when the policy was loosened to
// editor-or-admin for mutations and viewer-or-above for drift detection.

// rememberDrift stores a drift-detection result in the in-memory cache keyed
// by repo URL / path / cluster / namespace. Safe for concurrent use.
func (h *GitOpsHandlers) rememberDrift(req DetectDriftRequest, result *DetectDriftResponse) {
	if result == nil {
		return
	}
	key := fmt.Sprintf("%s|%s|%s|%s", req.RepoURL, req.Path, req.Cluster, req.Namespace)
	drifts := make([]GitOpsDrift, 0, len(result.Resources))
	if result.Drifted {
		for _, r := range result.Resources {
			drifts = append(drifts, GitOpsDrift{
				Resource:  r.Name,
				Namespace: r.Namespace,
				Cluster:   req.Cluster,
				Kind:      r.Kind,
				DriftType: "modified",
				Details:   fmt.Sprintf("%s: %s", r.Field, r.DiffOutput),
				Severity:  "medium",
			})
		}
	}
	h.driftCacheMu.Lock()
	defer h.driftCacheMu.Unlock()
	h.driftCache[key] = driftCacheEntry{drifts: drifts, detected: time.Now()}
}

// snapshotDrifts returns all cached drifts matching the optional
// cluster/namespace filter, dropping entries older than driftCacheTTL.
func (h *GitOpsHandlers) snapshotDrifts(cluster, namespace string) []GitOpsDrift {
	now := time.Now()
	h.driftCacheMu.Lock()
	defer h.driftCacheMu.Unlock()
	out := make([]GitOpsDrift, 0)
	for k, entry := range h.driftCache {
		if now.Sub(entry.detected) > driftCacheTTL {
			delete(h.driftCache, k)
			continue
		}
		for _, d := range entry.drifts {
			if cluster != "" && d.Cluster != cluster {
				continue
			}
			if namespace != "" && d.Namespace != namespace {
				continue
			}
			out = append(out, d)
		}
	}
	return out
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
	Name        string `json:"name"`
	Namespace   string `json:"namespace"`
	Path        string `json:"path"`
	SourceRef   string `json:"sourceRef"`
	Ready       bool   `json:"ready"`
	Status      string `json:"status"`
	Message     string `json:"message,omitempty"`
	LastApplied string `json:"lastApplied,omitempty"`
	Cluster     string `json:"cluster,omitempty"`
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

// ListDrifts returns a list of detected drifts (for GET endpoint).
//
// #5950 — Previously this always returned an empty slice, so the UI drift
// card never showed anything. We now expose drift results cached from recent
// DetectDrift calls (see rememberDrift) filtered by the optional query
// params. Entries older than driftCacheTTL are evicted on read.
func (h *GitOpsHandlers) ListDrifts(c *fiber.Ctx) error {
	cluster := c.Query("cluster")
	namespace := c.Query("namespace")

	drifts := h.snapshotDrifts(cluster, namespace)
	return c.JSON(fiber.Map{
		"drifts": drifts,
	})
}

// ListHelmReleases returns all Helm releases across all namespaces
func (h *GitOpsHandlers) ListHelmReleases(c *fiber.Ctx) error {
	cluster := c.Query("cluster")

	// SECURITY: Validate cluster name before passing to helm CLI
	if cluster != "" {
		if err := validateK8sName(cluster, "cluster"); err != nil {
			return c.Status(400).JSON(fiber.Map{"error": err.Error()})
		}
	}

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
			slog.Warn("[GitOps] error listing healthy clusters for releases", "error", err)
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

// helmReleaseNameRe extracts the release name and revision from a Helm
// release secret name, e.g. "sh.helm.release.v1.my-release.v3" →
// name="my-release", revision="3".
var helmReleaseNameRe = regexp.MustCompile(`^sh\.helm\.release\.v1\.(.+)\.v(\d+)$`)

// helmReleaseBody is the minimal subset of the Helm release protobuf we
// decode from the secret's "release" data field (base64 → gzip → JSON).
// Helm stores chart metadata and status inside this blob.
type helmReleaseBody struct {
	Name      string `json:"name"`
	Namespace string `json:"namespace"`
	Version   int    `json:"version"`
	Info      struct {
		Status    string `json:"status"`
		LastDeploy string `json:"last_deployed"`
	} `json:"info"`
	Chart struct {
		Metadata struct {
			Name       string `json:"name"`
			Version    string `json:"version"`
			AppVersion string `json:"appVersion"`
		} `json:"metadata"`
	} `json:"chart"`
}

// getHelmReleasesForCluster gets helm releases for a specific cluster.
//
// It first attempts to list releases via the Kubernetes API by querying
// secrets with label owner=helm (the storage backend Helm uses by default).
// If the k8s client is unavailable for the requested cluster, it falls back
// to shelling out to the helm binary.
func (h *GitOpsHandlers) getHelmReleasesForCluster(ctx context.Context, cluster string) []HelmRelease {
	// Try K8s API approach first when client is available.
	if h.k8sClient != nil {
		releases, err := h.getHelmReleasesViaK8sAPI(ctx, cluster)
		if err == nil {
			return releases
		}
		slog.Warn("[GitOps] k8s API helm listing failed, falling back to helm CLI",
			"cluster", cluster, "error", err)
	}

	return h.getHelmReleasesViaExec(ctx, cluster)
}

// getHelmReleasesViaK8sAPI lists Helm releases by querying Kubernetes secrets
// with label owner=helm across all namespaces.
func (h *GitOpsHandlers) getHelmReleasesViaK8sAPI(ctx context.Context, cluster string) ([]HelmRelease, error) {
	clusterCtx := cluster
	if clusterCtx == "" {
		clusterCtx = "in-cluster"
	}

	clientset, err := h.k8sClient.GetClient(clusterCtx)
	if err != nil {
		return nil, fmt.Errorf("get client for %s: %w", clusterCtx, err)
	}

	secretList, err := clientset.CoreV1().Secrets("").List(ctx, metav1.ListOptions{
		LabelSelector: "owner=helm",
	})
	if err != nil {
		return nil, fmt.Errorf("list helm secrets in %s: %w", clusterCtx, err)
	}

	// Track the highest revision per release name+namespace so we only
	// return the latest revision for each release.
	type releaseKey struct {
		name, namespace string
	}
	best := make(map[releaseKey]HelmRelease)

	for _, secret := range secretList.Items {
		m := helmReleaseNameRe.FindStringSubmatch(secret.Name)
		if m == nil {
			continue
		}
		releaseName := m[1]
		revision := m[2]

		hr := HelmRelease{
			Name:      releaseName,
			Namespace: secret.Namespace,
			Revision:  revision,
			Status:    secret.Labels["status"],
			Cluster:   cluster,
		}

		// Try to decode the release blob for chart metadata and timestamps.
		if raw, ok := secret.Data["release"]; ok {
			if body, decErr := decodeHelmRelease(raw); decErr == nil {
				if body.Chart.Metadata.Name != "" {
					hr.Chart = body.Chart.Metadata.Name + "-" + body.Chart.Metadata.Version
				}
				hr.AppVersion = body.Chart.Metadata.AppVersion
				hr.Updated = body.Info.LastDeploy
				if body.Info.Status != "" {
					hr.Status = body.Info.Status
				}
			}
		}

		key := releaseKey{name: releaseName, namespace: secret.Namespace}
		revNum, _ := strconv.Atoi(revision)
		if prev, exists := best[key]; !exists {
			best[key] = hr
		} else {
			prevNum, _ := strconv.Atoi(prev.Revision)
			if revNum > prevNum {
				best[key] = hr
			}
		}
	}

	releases := make([]HelmRelease, 0, len(best))
	for _, r := range best {
		releases = append(releases, r)
	}

	slog.Info("[GitOps] listed helm releases via k8s API",
		"cluster", cluster, "count", len(releases))
	return releases, nil
}

// maxHelmReleaseBytes bounds decompressed Helm release payloads to prevent
// excessive memory usage from malformed or adversarial secrets.
const maxHelmReleaseBytes = 10 * 1024 * 1024 // 10 MB

// decodeHelmRelease decodes the Helm release payload stored in a secret's
// "release" data field. Helm stores this as: base64(gzip(json)).
func decodeHelmRelease(data []byte) (*helmReleaseBody, error) {
	decoded, err := base64.StdEncoding.DecodeString(string(data))
	if err != nil {
		return nil, err
	}

	gz, err := gzip.NewReader(bytes.NewReader(decoded))
	if err != nil {
		return nil, err
	}
	defer gz.Close()

	uncompressed, err := io.ReadAll(io.LimitReader(gz, maxHelmReleaseBytes))
	if err != nil {
		return nil, err
	}

	var body helmReleaseBody
	if err := json.Unmarshal(uncompressed, &body); err != nil {
		return nil, err
	}
	return &body, nil
}

// getHelmReleasesViaExec falls back to shelling out to the helm binary.
func (h *GitOpsHandlers) getHelmReleasesViaExec(ctx context.Context, cluster string) []HelmRelease {
	args := []string{"ls", "-A", "--output", "json"}
	if cluster != "" {
		args = append(args, "--kube-context", cluster)
	}

	cmd := exec.CommandContext(ctx, "helm", args...)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		slog.Warn("[GitOps] helm ls failed", "cluster", cluster, "error", err, "stderr", stderr.String())
		return []HelmRelease{}
	}

	releases := make([]HelmRelease, 0)
	if err := json.Unmarshal(stdout.Bytes(), &releases); err != nil {
		slog.Warn("[GitOps] failed to parse helm ls output", "cluster", cluster, "error", err)
		return []HelmRelease{}
	}

	for i := range releases {
		releases[i].Cluster = cluster
	}

	return releases
}

// ListKustomizations returns Flux Kustomization resources
func (h *GitOpsHandlers) ListKustomizations(c *fiber.Ctx) error {
	cluster := c.Query("cluster")

	// SECURITY: Validate cluster name before passing to kubectl CLI
	if cluster != "" {
		if err := validateK8sName(cluster, "cluster"); err != nil {
			return c.Status(400).JSON(fiber.Map{"error": err.Error()})
		}
	}

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
			slog.Warn("[GitOps] error listing healthy clusters for kustomizations", "error", err)
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
		slog.Warn("[GitOps] kubectl get kustomizations failed", "cluster", cluster, "error", err, "stderr", stderr.String())
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
		slog.Warn("[GitOps] failed to parse kustomizations", "cluster", cluster, "error", err)
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
	// PendingUpgrade is set when installedCSV differs from currentCSV,
	// indicating an upgrade is waiting for approval (#7548).
	PendingUpgrade string `json:"pendingUpgrade,omitempty"`
	Cluster        string `json:"cluster,omitempty"`
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
	operatorCacheEmptyTTL         = 30 * time.Second
	operatorCacheEvictionInterval = 5 * time.Minute
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
// operatorFetchGroup coalesces concurrent cache-miss fetches for the same
// cluster into a single request, preventing the check-then-act race where
// two goroutines both see an empty cache and fetch in parallel (#7783).
var (
	operatorCacheMu    sync.RWMutex
	operatorCacheData  = make(map[string]*operatorCacheEntry)
	operatorFetchGroup singleflight.Group
	operatorEvictOnce  sync.Once
	// operatorEvictCtx / operatorEvictCancel provide context-based
	// cancellation for the background evictor goroutine (#11259).
	operatorEvictCtx    context.Context
	operatorEvictCancel context.CancelFunc
)

func init() {
	operatorEvictCtx, operatorEvictCancel = context.WithCancel(context.Background())
}

// ListOperators returns OLM-managed operators (ClusterServiceVersions)

// startOperatorCacheEvictor begins a background goroutine that evicts expired
// operator cache entries every 5 minutes. Empty results use a 30s TTL, normal
// results use a 5m TTL. Must be called exactly once from getOperatorsForCluster().
func startOperatorCacheEvictor() {
	operatorEvictOnce.Do(func() {
		go func() {
			ticker := time.NewTicker(operatorCacheEvictionInterval)
			defer ticker.Stop()

			for {
				select {
				case <-operatorEvictCtx.Done():
					return
				case <-ticker.C:
					operatorCacheMu.Lock()
					now := time.Now()
					for cacheKey, entry := range operatorCacheData {
						ttl := operatorCacheTTL
						if len(entry.operators) == 0 {
							ttl = operatorCacheEmptyTTL
						}
						if now.Sub(entry.fetchedAt) > ttl {
							delete(operatorCacheData, cacheKey)
						}
					}
					operatorCacheMu.Unlock()
				}
			}
		}()
	})
}

// StopOperatorCacheEvictor signals the background evictor goroutine to exit.
// Safe to call multiple times. Intended for server shutdown and tests.
func StopOperatorCacheEvictor() {
	operatorEvictCancel()
}
