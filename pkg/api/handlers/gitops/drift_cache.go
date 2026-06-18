package gitops

import (
	"fmt"
	"time"

	"github.com/gofiber/fiber/v2"
)

const driftCacheTTL = 30 * time.Second

type driftCacheEntry struct {
	drifts   []GitOpsDrift
	detected time.Time
}

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

func (h *GitOpsHandlers) snapshotDrifts(cluster, namespace string) []GitOpsDrift {
	now := time.Now()
	h.driftCacheMu.Lock()
	defer h.driftCacheMu.Unlock()
	out := make([]GitOpsDrift, 0)
	for key, entry := range h.driftCache {
		if now.Sub(entry.detected) > driftCacheTTL {
			delete(h.driftCache, key)
			continue
		}
		for _, drift := range entry.drifts {
			if cluster != "" && drift.Cluster != cluster {
				continue
			}
			if namespace != "" && drift.Namespace != namespace {
				continue
			}
			out = append(out, drift)
		}
	}
	return out
}

func (h *GitOpsHandlers) ListDrifts(c *fiber.Ctx) error {
	cluster := c.Query("cluster")
	namespace := c.Query("namespace")
	return c.JSON(fiber.Map{"drifts": h.snapshotDrifts(cluster, namespace)})
}
