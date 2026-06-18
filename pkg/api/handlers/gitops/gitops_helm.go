package gitops

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
	"strings"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"github.com/kubestellar/console/pkg/safego"
)

// helmFailureCooldown tracks clusters where Helm listing has failed due to
// RBAC (forbidden) errors. After a failure, retries are suppressed for 30s.
var (
	helmFailureMu       sync.RWMutex
	helmFailureCooldown = make(map[string]time.Time)
)

const helmCooldownDuration = 30 * time.Second

// ListHelmReleases returns all Helm releases across all namespaces
func (h *GitOpsHandlers) ListHelmReleases(c *fiber.Ctx) error {
	cluster := c.Query("cluster")

	// SECURITY: Validate cluster name before passing to helm CLI
	if cluster != "" {
		if err := validateK8sName(cluster, "cluster"); err != nil {
			return c.Status(400).JSON(fiber.Map{"error": "invalid cluster name"})
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
			clusterName := cl.Name
			wg.Add(1)
			safego.GoWith("gitops-helm-releases/"+clusterName, func() {
				defer wg.Done()
				select {
				case subprocessSem <- struct{}{}:
					defer func() { <-subprocessSem }()
				case <-c.Context().Done():
					return
				}
				ctx, cancel := context.WithTimeout(c.Context(), helmStreamPerClusterTimeout)
				defer cancel()

				releases := h.getHelmReleasesForCluster(ctx, clusterName)
				if len(releases) > 0 {
					mu.Lock()
					allReleases = append(allReleases, releases...)
					mu.Unlock()
				}
			})
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
		Status     string `json:"status"`
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
	// Check cooldown — if this cluster recently failed with RBAC error, skip
	helmFailureMu.RLock()
	if cooldownUntil, ok := helmFailureCooldown[cluster]; ok && time.Now().Before(cooldownUntil) {
		helmFailureMu.RUnlock()
		return nil
	}
	helmFailureMu.RUnlock()

	// Try K8s API approach first when client is available.
	if h.k8sClient != nil {
		releases, err := h.getHelmReleasesViaK8sAPI(ctx, cluster)
		if err == nil {
			return releases
		}
		slog.Warn("[GitOps] k8s API helm listing failed, falling back to helm CLI",
			"cluster", cluster, "error", err)

		// If the error is RBAC-related (forbidden), enter cooldown
		if isRBACError(err) {
			helmFailureMu.Lock()
			helmFailureCooldown[cluster] = time.Now().Add(helmCooldownDuration)
			helmFailureMu.Unlock()
			return nil
		}
	}

	return h.getHelmReleasesViaExec(ctx, cluster)
}

// isRBACError checks if an error indicates a Kubernetes RBAC denial.
func isRBACError(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	return strings.Contains(msg, "forbidden") || strings.Contains(msg, "Forbidden") ||
		strings.Contains(msg, "cannot list") || strings.Contains(msg, "unauthorized")
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
