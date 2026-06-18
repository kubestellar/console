package gitops

import (
"fmt"
"time"

"github.com/gofiber/fiber/v2"
)

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
