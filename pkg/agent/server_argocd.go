package agent

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"sync"
	"time"

	"github.com/kubestellar/console/pkg/api/v1alpha1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// argocdSyncTimeout bounds a single argocd sync HTTP request from kc-agent
// (matches the backend argocdQueryTimeout in pkg/api/handlers/gitops.go).
const argocdSyncTimeout = 15 * time.Second

// argocdCLITimeoutSeconds is the value passed to `argocd app sync --timeout`.
// Matches the backend hardcoded value in TriggerArgoSync.
const argocdCLITimeoutSeconds = "30"

// argocdInsecureWarning ensures the TLS skip warning is logged only once per
// kc-agent process when ARGOCD_TLS_INSECURE=true is set.
var argocdInsecureWarning sync.Once

// agentArgoSyncRequest mirrors pkg/api/handlers/gitops.go TriggerArgoSync
// inline request struct.
type agentArgoSyncRequest struct {
	AppName   string `json:"appName"`
	Namespace string `json:"namespace"`
	Cluster   string `json:"cluster"`
}

// handleArgoCDSync is the kc-agent version of the legacy backend
// /api/gitops/argocd/sync endpoint. It tries three strategies in order:
//  1. ArgoCD REST API if ARGOCD_AUTH_TOKEN is set in the agent's environment
//  2. argocd CLI if available on PATH
//  3. Patching the Application CR's `operation` field via the dynamic client
//     loaded under the user's kubeconfig
//
// Strategies 1 and 2 are environment-side and behave identically to the
// backend. Strategy 3 is the one that previously ran under the pod
// ServiceAccount on the backend; on kc-agent it runs under the user's
// kubeconfig (#7993 Phase 3c).
func (s *Server) handleArgoCDSync(w http.ResponseWriter, r *http.Request) {
	// POST-only ArgoCD sync — preflight must advertise POST (#8040, #8201).
	s.setCORSHeaders(w, r, http.MethodPost, http.MethodOptions)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		writeJSON(w, map[string]string{"error": "POST required"})
		return
	}

	var req agentArgoSyncRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		// #8040: match backend TriggerArgoSync error string casing exactly.
		writeJSON(w, map[string]interface{}{"error": "Invalid request body", "success": false})
		return
	}

	if req.AppName == "" || req.Cluster == "" {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, map[string]interface{}{"error": "appName and cluster are required", "success": false})
		return
	}
	if err := validateHelmK8sName(req.AppName, "appName"); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, map[string]interface{}{"error": err.Error(), "success": false})
		return
	}
	if err := validateHelmK8sName(req.Cluster, "cluster"); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, map[string]interface{}{"error": err.Error(), "success": false})
		return
	}

	if s.k8sClient == nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		writeJSON(w, map[string]interface{}{"error": "Kubernetes client not configured", "success": false})
		return
	}

	// defaultArgoNamespace is the conventional namespace for ArgoCD installs.
	const defaultArgoNamespace = "argocd"
	namespace := req.Namespace
	if namespace == "" {
		namespace = defaultArgoNamespace
	} else if err := validateHelmK8sName(namespace, "namespace"); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, map[string]interface{}{"error": err.Error(), "success": false})
		return
	}

	slog.Info("[agent ArgoCD] triggering sync", "namespace", namespace, "app", req.AppName, "cluster", req.Cluster)

	// Strategy 1: ArgoCD REST API if a token is configured in the agent env.
	argoToken := os.Getenv("ARGOCD_AUTH_TOKEN")
	if argoToken != "" {
		argoServerURL := s.discoverArgoServerURL(r.Context(), req.Cluster)
		if argoServerURL != "" {
			if ok := tryArgoRESTSync(r.Context(), argoServerURL, argoToken, req.AppName); ok {
				// #8040: success response shape mirrors backend TriggerArgoSync
				// exactly — no extra `source` field.
				writeJSON(w, map[string]interface{}{
					"success": true,
					"message": "Sync triggered via ArgoCD REST API",
					"method":  "api",
				})
				return
			}
		}
	}

	// Strategy 2: argocd CLI if available.
	if _, err := exec.LookPath("argocd"); err == nil {
		cmd := execCommandContext(r.Context(), "argocd", "app", "sync", req.AppName,
			"--namespace", namespace,
			"--prune",
			"--timeout", argocdCLITimeoutSeconds,
		)
		output, err := cmd.CombinedOutput()
		if err != nil {
			slog.Warn("[agent ArgoCD] CLI sync failed, falling back to annotation patching", "error", err, "output", string(output))
		} else {
			// #8040: success response shape mirrors backend TriggerArgoSync.
			writeJSON(w, map[string]interface{}{
				"success": true,
				"message": "Sync triggered via ArgoCD CLI",
				"method":  "cli",
			})
			return
		}
	}

	// Strategy 3: Annotate the Application to trigger a refresh + sync.
	dynamicClient, err := s.k8sClient.GetDynamicClient(req.Cluster)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		writeJSON(w, map[string]interface{}{"error": fmt.Sprintf("Failed to get dynamic client: %v", err), "success": false})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), argocdSyncTimeout)
	defer cancel()

	app, err := dynamicClient.Resource(v1alpha1.ArgoApplicationGVR).Namespace(namespace).Get(ctx, req.AppName, metav1.GetOptions{})
	if err != nil {
		w.WriteHeader(http.StatusNotFound)
		writeJSON(w, map[string]interface{}{
			"error":   fmt.Sprintf("Application %s not found in %s/%s: %v", req.AppName, req.Cluster, namespace, err),
			"success": false,
		})
		return
	}

	annotations := app.GetAnnotations()
	if annotations == nil {
		annotations = make(map[string]string)
	}
	annotations["argocd.argoproj.io/refresh"] = "hard"
	app.SetAnnotations(annotations)

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

	if _, err := dynamicClient.Resource(v1alpha1.ArgoApplicationGVR).Namespace(namespace).Update(ctx, app, metav1.UpdateOptions{}); err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		writeJSON(w, map[string]interface{}{"error": fmt.Sprintf("Failed to trigger sync: %v", err), "success": false})
		return
	}

	// #8040: success response shape mirrors backend TriggerArgoSync.
	writeJSON(w, map[string]interface{}{
		"success": true,
		"message": "Sync triggered via Application resource annotation",
		"method":  "annotation",
	})
}

// tryArgoRESTSync performs the ArgoCD REST API sync call. Returns true on
// 2xx response, false otherwise. Pulled out of handleArgoCDSync so the main
// handler stays linear.
func tryArgoRESTSync(ctx context.Context, argoServerURL, argoToken, appName string) bool {
	syncURL := fmt.Sprintf("%s/api/v1/applications/%s/sync", argoServerURL, url.PathEscape(appName))
	syncBody := []byte(`{"prune":true}`)

	httpReq, err := http.NewRequestWithContext(ctx, "POST", syncURL, bytes.NewReader(syncBody))
	if err != nil {
		slog.Warn("[agent ArgoCD] REST API sync request build failed", "error", err)
		return false
	}
	httpReq.Header.Set("Authorization", "Bearer "+argoToken)
	httpReq.Header.Set("Content-Type", "application/json")

	skipVerify := os.Getenv("ARGOCD_TLS_INSECURE") == "true"
	if skipVerify {
		argocdInsecureWarning.Do(func() {
			slog.Warn("WARNING: ARGOCD_TLS_INSECURE=true — TLS certificate verification disabled for ArgoCD API calls. " +
				"This should only be used in development/test environments with self-signed certificates.")
		})
	}
	client := &http.Client{
		Timeout: argocdSyncTimeout,
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: skipVerify}, // #nosec G402 -- intentionally env-var-gated (ARGOCD_TLS_INSECURE) for self-signed certs in dev/test
		},
	}
	resp, err := client.Do(httpReq)
	if err != nil {
		slog.Warn("[agent ArgoCD] REST API sync failed", "error", err)
		return false
	}
	// Drain the response body before closing to avoid HTTP connection pool
	// exhaustion from partially-read bodies (#7746).
	defer func() {
		_, _ = io.Copy(io.Discard, resp.Body)
		resp.Body.Close()
	}()
	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		return true
	}
	slog.Warn("[agent ArgoCD] REST API sync returned error status", "status", resp.StatusCode)
	return false
}

// discoverArgoServerURL is the kc-agent equivalent of
// pkg/api/handlers/gitops.go#discoverArgoServerURL.
//
// #8040: kc-agent runs on the user's localhost (README notes 127.0.0.1:8585),
// so the in-cluster DNS name (`argocd-server.<ns>.svc`) returned by the
// backend-equivalent discovery is not reachable. Callers must therefore be
// able to override the URL. Order of precedence:
//  1. ARGOCD_SERVER_URL env var — explicit override, always wins when set.
//  2. Walks the well-known ArgoCD namespaces for the `argocd-server` service
//     and returns its in-cluster DNS URL (works when kc-agent is itself
//     running inside the cluster or when a side-channel makes the DNS
//     resolvable, e.g. kubectl port-forward or a mesh).
//  3. Empty string if neither is available — the caller falls back to the
//     CLI / annotation-patch strategies.
func (s *Server) discoverArgoServerURL(ctx context.Context, cluster string) string {
	if override := os.Getenv("ARGOCD_SERVER_URL"); override != "" {
		return override
	}

	clientset, err := s.k8sClient.GetClient(cluster)
	if err != nil {
		slog.Warn("[agent ArgoCD] server discovery failed: cannot get client", "cluster", cluster, "error", err)
		return ""
	}

	// commonArgoNamespaces are the well-known namespaces an ArgoCD install
	// might use. Matches the backend list verbatim.
	commonArgoNamespaces := []string{"argocd", "argo-cd", "gitops"}
	for _, ns := range commonArgoNamespaces {
		svc, err := clientset.CoreV1().Services(ns).Get(ctx, "argocd-server", metav1.GetOptions{})
		if err == nil {
			if len(svc.Spec.Ports) > 0 {
				inClusterURL := fmt.Sprintf("https://%s.%s.svc:%d", svc.Name, svc.Namespace, svc.Spec.Ports[0].Port)
				slog.Info("[agent ArgoCD] server discovery: found in-cluster service; set ARGOCD_SERVER_URL to override when running kc-agent on localhost",
					"cluster", cluster, "url", inClusterURL)
				return inClusterURL
			}
			slog.Warn("[agent ArgoCD] server discovery: argocd-server service has no ports", "namespace", ns)
		}
	}
	slog.Info("[agent ArgoCD] server discovery: argocd-server service not found; set ARGOCD_SERVER_URL to point kc-agent at a reachable URL", "cluster", cluster)
	return ""
}
