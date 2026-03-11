import { describe, it, expect } from "vitest";
import {
  pct,
  parseTimestamp,
  generateId,
  detectEventCorrelations,
  detectClusterDeltas,
  detectCascadeImpact,
  detectConfigDrift,
  detectResourceImbalance,
  detectRestartCorrelation,
  trackRolloutProgress,
} from "./useMultiClusterInsights";
import type { ClusterEvent, Deployment, PodIssue } from "./mcp/types";
import type { ClusterInfo } from "./mcp/types";

// ── Test Constants (mirror source thresholds) ─────────────────────────

/** Time window for event correlation grouping (5 minutes) */
const EVENT_CORRELATION_WINDOW_MS = 5 * 60 * 1000;
/** Time window for cascade detection (15 minutes) */
const CASCADE_DETECTION_WINDOW_MS = 15 * 60 * 1000;
/** Pod restart count threshold */
const RESTART_CORRELATION_THRESHOLD = 3;
/** CPU threshold for critical severity */
const CPU_CRITICAL_THRESHOLD_PCT = 85;
/** Total restart count for critical severity escalation */
const RESTART_CRITICAL_THRESHOLD = 20;
/** Minimum workloads for infra-issue critical escalation */
const INFRA_CRITICAL_WORKLOADS = 5;
/** Maximum insights per category */
const MAX_INSIGHTS_PER_CATEGORY = 10;
/** Minimum clusters for correlation/cascade detection */
const MIN_CORRELATED_CLUSTERS = 2;
/** Fixed timestamp used in test factories for determinism */
const FIXED_TIMESTAMP = "2026-01-15T10:00:00.000Z";

// ── Helper factory functions ──────────────────────────────────────────

function makeEvent(overrides: Partial<ClusterEvent> = {}): ClusterEvent {
  return {
    type: "Warning",
    reason: "BackOff",
    message: "Back-off restarting failed container",
    object: "pod/test-pod",
    namespace: "default",
    cluster: "cluster-1",
    count: 1,
    lastSeen: FIXED_TIMESTAMP,
    ...overrides,
  };
}

function makeDeployment(overrides: Partial<Deployment> = {}): Deployment {
  return {
    name: "api-server",
    namespace: "default",
    cluster: "cluster-1",
    status: "running",
    replicas: 3,
    readyReplicas: 3,
    updatedReplicas: 3,
    availableReplicas: 3,
    progress: 100,
    image: "api-server:v1.0.0",
    ...overrides,
  };
}

function makeCluster(overrides: Partial<ClusterInfo> = {}): ClusterInfo {
  return {
    name: "cluster-1",
    context: "cluster-1-ctx",
    healthy: true,
    cpuCores: 8,
    memoryGB: 32,
    ...overrides,
  };
}

function makePodIssue(overrides: Partial<PodIssue> = {}): PodIssue {
  return {
    name: "api-server-abc123-xyz",
    namespace: "default",
    cluster: "cluster-1",
    status: "CrashLoopBackOff",
    issues: ["CrashLoopBackOff"],
    restarts: 5,
    ...overrides,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────

describe("pct", () => {
  it("returns 0 for undefined value", () => {
    expect(pct(undefined, 100)).toBe(0);
  });

  it("returns 0 for undefined total", () => {
    expect(pct(50, undefined)).toBe(0);
  });

  it("returns 0 when total is 0", () => {
    expect(pct(50, 0)).toBe(0);
  });

  it("calculates correct percentage", () => {
    expect(pct(25, 100)).toBe(25);
    expect(pct(1, 3)).toBe(33);
  });

  it("returns 0 when value is 0 (known falsy behavior)", () => {
    // Documents the known bug: value=0 is treated as falsy
    expect(pct(0, 100)).toBe(0);
  });
});

describe("parseTimestamp", () => {
  it("returns 0 for undefined", () => {
    expect(parseTimestamp(undefined)).toBe(0);
  });

  it("returns 0 for empty string", () => {
    expect(parseTimestamp("")).toBe(0);
  });

  it("parses valid ISO string", () => {
    const ts = "2026-01-15T10:00:00.000Z";
    expect(parseTimestamp(ts)).toBe(new Date(ts).getTime());
  });

  it("returns 0 for malformed date string", () => {
    expect(parseTimestamp("not-a-date")).toBe(0);
    expect(parseTimestamp("abc123")).toBe(0);
    expect(parseTimestamp("2026-99-99")).toBe(0);
  });
});

describe("generateId", () => {
  it("creates id from category and parts", () => {
    expect(generateId("config-drift", "ns/app")).toBe("config-drift:ns/app");
  });

  it("joins multiple parts", () => {
    expect(generateId("restart-correlation", "app-bug", "ns/app")).toBe(
      "restart-correlation:app-bug:ns/app",
    );
  });
});

// ── Algorithm 1: Event Correlations ───────────────────────────────────

describe("detectEventCorrelations", () => {
  it("returns empty for no events", () => {
    expect(detectEventCorrelations([])).toEqual([]);
  });

  it("handles undefined input gracefully", () => {
    expect(
      detectEventCorrelations(undefined as unknown as ClusterEvent[]),
    ).toEqual([]);
  });

  it("returns empty for non-Warning events", () => {
    const events = [makeEvent({ type: "Normal" })];
    expect(detectEventCorrelations(events)).toEqual([]);
  });

  it("returns empty when events come from a single cluster", () => {
    const ts = new Date("2026-01-15T10:00:00Z").toISOString();
    const events = [
      makeEvent({ cluster: "cluster-1", lastSeen: ts }),
      makeEvent({ cluster: "cluster-1", lastSeen: ts }),
    ];
    expect(detectEventCorrelations(events)).toEqual([]);
  });

  it("detects correlations when 2+ clusters have warnings in same time window", () => {
    const ts = new Date("2026-01-15T10:00:00Z").toISOString();
    const events = [
      makeEvent({ cluster: "cluster-1", lastSeen: ts }),
      makeEvent({ cluster: "cluster-2", lastSeen: ts }),
    ];
    const result = detectEventCorrelations(events);
    expect(result).toHaveLength(1);
    expect(result[0].category).toBe("event-correlation");
    expect(result[0].affectedClusters).toEqual(
      expect.arrayContaining(["cluster-1", "cluster-2"]),
    );
  });

  it("escalates severity to critical when 3+ clusters affected", () => {
    const ts = new Date("2026-01-15T10:00:00Z").toISOString();
    const events = [
      makeEvent({ cluster: "cluster-1", lastSeen: ts }),
      makeEvent({ cluster: "cluster-2", lastSeen: ts }),
      makeEvent({ cluster: "cluster-3", lastSeen: ts }),
    ];
    const result = detectEventCorrelations(events);
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe("critical");
  });

  it("does not correlate events in different time windows", () => {
    const ts1 = new Date("2026-01-15T10:00:00Z").toISOString();
    // 10 min later — different 5-min window
    const ts2 = new Date("2026-01-15T10:10:00Z").toISOString();
    const events = [
      makeEvent({ cluster: "cluster-1", lastSeen: ts1 }),
      makeEvent({ cluster: "cluster-2", lastSeen: ts2 }),
    ];
    const result = detectEventCorrelations(events);
    expect(result).toHaveLength(0);
  });

  it("skips events without lastSeen", () => {
    const ts = new Date("2026-01-15T10:00:00Z").toISOString();
    const events = [
      makeEvent({ cluster: "cluster-1", lastSeen: ts }),
      makeEvent({ cluster: "cluster-2", lastSeen: undefined }),
    ];
    expect(detectEventCorrelations(events)).toEqual([]);
  });

  it("handles malformed timestamps gracefully", () => {
    const events = [
      makeEvent({ cluster: "cluster-1", lastSeen: "not-a-date" }),
      makeEvent({ cluster: "cluster-2", lastSeen: "also-bad" }),
    ];
    // Malformed timestamps return 0 from parseTimestamp, so ts === 0,
    // and the `if (ts === 0) continue` guard skips them
    expect(detectEventCorrelations(events)).toEqual([]);
  });

  it("truncates results to MAX_INSIGHTS_PER_CATEGORY", () => {
    // Create 12 distinct time windows, each with events from 2 clusters
    const base = new Date("2026-01-15T00:00:00Z").getTime();
    const events: ClusterEvent[] = [];
    for (let i = 0; i < MAX_INSIGHTS_PER_CATEGORY + 2; i++) {
      // Each window is spaced well apart (1 hour) so they don't merge
      const ts = new Date(base + i * 60 * 60 * 1000).toISOString();
      events.push(
        makeEvent({ cluster: "cluster-1", lastSeen: ts }),
        makeEvent({ cluster: "cluster-2", lastSeen: ts }),
      );
    }
    const result = detectEventCorrelations(events);
    expect(result).toHaveLength(MAX_INSIGHTS_PER_CATEGORY);
  });
});

// ── Algorithm 2: Cluster Deltas ───────────────────────────────────────

describe("detectClusterDeltas", () => {
  it("returns empty for no deployments", () => {
    expect(detectClusterDeltas([], [])).toEqual([]);
  });

  it("handles undefined input gracefully", () => {
    expect(
      detectClusterDeltas(
        undefined as unknown as Deployment[],
        undefined as unknown as ClusterInfo[],
      ),
    ).toEqual([]);
  });

  it("returns empty for single cluster deployment", () => {
    const deps = [makeDeployment({ cluster: "cluster-1" })];
    const clusters = [makeCluster({ name: "cluster-1" })];
    expect(detectClusterDeltas(deps, clusters)).toEqual([]);
  });

  it("detects image version deltas across clusters", () => {
    const deps = [
      makeDeployment({ cluster: "cluster-1", image: "api:v1.0" }),
      makeDeployment({ cluster: "cluster-2", image: "api:v2.0" }),
    ];
    const clusters = [
      makeCluster({ name: "cluster-1" }),
      makeCluster({ name: "cluster-2" }),
    ];
    const result = detectClusterDeltas(deps, clusters);
    expect(result).toHaveLength(1);
    expect(result[0].category).toBe("cluster-delta");
    expect(result[0].deltas).toBeDefined();
    expect(result[0].deltas!.some((d) => d.dimension === "Image Version")).toBe(
      true,
    );
  });

  it("detects replica count deltas", () => {
    const deps = [
      makeDeployment({ cluster: "cluster-1", replicas: 3, image: "api:v1.0" }),
      makeDeployment({ cluster: "cluster-2", replicas: 10, image: "api:v1.0" }),
    ];
    const clusters = [
      makeCluster({ name: "cluster-1" }),
      makeCluster({ name: "cluster-2" }),
    ];
    const result = detectClusterDeltas(deps, clusters);
    expect(result).toHaveLength(1);
    const replicaDelta = result[0].deltas!.find(
      (d) => d.dimension === "Replica Count",
    );
    expect(replicaDelta).toBeDefined();
    expect(replicaDelta!.significance).toBe("high"); // 70% diff
  });

  it("detects status deltas", () => {
    const deps = [
      makeDeployment({
        cluster: "cluster-1",
        status: "running",
        image: "api:v1.0",
      }),
      makeDeployment({
        cluster: "cluster-2",
        status: "failed",
        image: "api:v1.0",
      }),
    ];
    const clusters = [
      makeCluster({ name: "cluster-1" }),
      makeCluster({ name: "cluster-2" }),
    ];
    const result = detectClusterDeltas(deps, clusters);
    expect(result).toHaveLength(1);
    const statusDelta = result[0].deltas!.find((d) => d.dimension === "Status");
    expect(statusDelta).toBeDefined();
    expect(statusDelta!.significance).toBe("high"); // failed = high
  });

  it("returns no deltas when deployments are identical", () => {
    const deps = [
      makeDeployment({ cluster: "cluster-1" }),
      makeDeployment({ cluster: "cluster-2" }),
    ];
    const clusters = [
      makeCluster({ name: "cluster-1" }),
      makeCluster({ name: "cluster-2" }),
    ];
    expect(detectClusterDeltas(deps, clusters)).toEqual([]);
  });
});

// ── Algorithm 3: Cascade Impact ───────────────────────────────────────

describe("detectCascadeImpact", () => {
  it("returns empty for fewer than 2 warnings", () => {
    const events = [makeEvent({ cluster: "cluster-1" })];
    expect(detectCascadeImpact(events)).toEqual([]);
  });

  it("handles undefined input gracefully", () => {
    expect(detectCascadeImpact(undefined as unknown as ClusterEvent[])).toEqual(
      [],
    );
  });

  it("returns empty when all warnings are from the same cluster", () => {
    const base = new Date("2026-01-15T10:00:00Z");
    const events = [
      makeEvent({ cluster: "cluster-1", lastSeen: base.toISOString() }),
      makeEvent({
        cluster: "cluster-1",
        lastSeen: new Date(base.getTime() + 60000).toISOString(),
      }),
    ];
    expect(detectCascadeImpact(events)).toEqual([]);
  });

  it("detects cascade when warnings spread across clusters within 15 min", () => {
    const base = new Date("2026-01-15T10:00:00Z");
    const events = [
      makeEvent({ cluster: "cluster-1", lastSeen: base.toISOString() }),
      makeEvent({
        cluster: "cluster-2",
        lastSeen: new Date(
          base.getTime() + EVENT_CORRELATION_WINDOW_MS,
        ).toISOString(),
      }),
    ];
    const result = detectCascadeImpact(events);
    expect(result).toHaveLength(1);
    expect(result[0].category).toBe("cascade-impact");
    expect(result[0].chain).toHaveLength(MIN_CORRELATED_CLUSTERS);
    expect(result[0].affectedClusters).toEqual(
      expect.arrayContaining(["cluster-1", "cluster-2"]),
    );
  });

  it("escalates to critical at 3+ clusters in cascade", () => {
    const base = new Date("2026-01-15T10:00:00Z");
    const events = [
      makeEvent({ cluster: "cluster-1", lastSeen: base.toISOString() }),
      makeEvent({
        cluster: "cluster-2",
        lastSeen: new Date(base.getTime() + 60000).toISOString(),
      }),
      makeEvent({
        cluster: "cluster-3",
        lastSeen: new Date(base.getTime() + 120000).toISOString(),
      }),
    ];
    const result = detectCascadeImpact(events);
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe("critical");
  });

  it("includes event exactly at 15-minute boundary (> check, not >=)", () => {
    const base = new Date("2026-01-15T10:00:00Z");
    const events = [
      makeEvent({ cluster: "cluster-1", lastSeen: base.toISOString() }),
      makeEvent({
        cluster: "cluster-2",
        lastSeen: new Date(
          base.getTime() + CASCADE_DETECTION_WINDOW_MS,
        ).toISOString(),
      }),
    ];
    // ts - baseTs === CASCADE_DETECTION_WINDOW_MS, and the check is `> CASCADE_DETECTION_WINDOW_MS`,
    // so exactly-at-boundary should NOT break, i.e. the event IS included
    const result = detectCascadeImpact(events);
    expect(result).toHaveLength(1);
    expect(result[0].chain).toHaveLength(MIN_CORRELATED_CLUSTERS);
  });

  it("excludes event 1ms past the 15-minute boundary", () => {
    const base = new Date("2026-01-15T10:00:00Z");
    const events = [
      makeEvent({ cluster: "cluster-1", lastSeen: base.toISOString() }),
      makeEvent({
        cluster: "cluster-2",
        lastSeen: new Date(
          base.getTime() + CASCADE_DETECTION_WINDOW_MS + 1,
        ).toISOString(),
      }),
    ];
    // 1ms past the window — should NOT be included in the chain
    expect(detectCascadeImpact(events)).toEqual([]);
  });
});

// ── Algorithm 4: Config Drift ─────────────────────────────────────────

describe("detectConfigDrift", () => {
  it("returns empty for no deployments", () => {
    expect(detectConfigDrift([])).toEqual([]);
  });

  it("handles undefined input gracefully", () => {
    expect(detectConfigDrift(undefined as unknown as Deployment[])).toEqual([]);
  });

  it("returns empty for single-cluster deployments", () => {
    const deps = [makeDeployment({ cluster: "cluster-1" })];
    expect(detectConfigDrift(deps)).toEqual([]);
  });

  it("returns empty when all deployments have same image and replicas", () => {
    const deps = [
      makeDeployment({ cluster: "cluster-1" }),
      makeDeployment({ cluster: "cluster-2" }),
    ];
    expect(detectConfigDrift(deps)).toEqual([]);
  });

  it("detects drift when images differ across clusters", () => {
    const deps = [
      makeDeployment({ cluster: "cluster-1", image: "api:v1.0" }),
      makeDeployment({ cluster: "cluster-2", image: "api:v2.0" }),
    ];
    const result = detectConfigDrift(deps);
    expect(result).toHaveLength(1);
    expect(result[0].category).toBe("config-drift");
    expect(result[0].severity).toBe("warning");
    expect(result[0].description).toContain("2 different images");
  });

  it("detects drift when replica counts differ", () => {
    const deps = [
      makeDeployment({ cluster: "cluster-1", replicas: 3, image: "api:v1.0" }),
      makeDeployment({ cluster: "cluster-2", replicas: 5, image: "api:v1.0" }),
    ];
    const result = detectConfigDrift(deps);
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe("info"); // only replicas differ, not images
    expect(result[0].description).toContain("2 different replica counts");
  });
});

// ── Algorithm 5: Resource Imbalance ───────────────────────────────────

describe("detectResourceImbalance", () => {
  it("returns empty for fewer than 2 clusters", () => {
    const clusters = [makeCluster({ name: "cluster-1", cpuCores: 8 })];
    expect(detectResourceImbalance(clusters)).toEqual([]);
  });

  it("handles undefined input gracefully", () => {
    expect(
      detectResourceImbalance(undefined as unknown as ClusterInfo[]),
    ).toEqual([]);
  });

  it("returns empty when clusters are balanced", () => {
    const clusters = [
      makeCluster({ name: "cluster-1", cpuCores: 8, cpuUsageCores: 4 }),
      makeCluster({ name: "cluster-2", cpuCores: 8, cpuUsageCores: 4 }),
    ];
    expect(detectResourceImbalance(clusters)).toEqual([]);
  });

  it("detects CPU imbalance when usage differs significantly", () => {
    const clusters = [
      makeCluster({ name: "cluster-1", cpuCores: 10, cpuUsageCores: 9 }), // 90%
      makeCluster({ name: "cluster-2", cpuCores: 10, cpuUsageCores: 2 }), // 20%
    ];
    const result = detectResourceImbalance(clusters);
    expect(result).toHaveLength(1);
    const cpuInsight = result.find((i) => i.title.includes("CPU"));
    expect(cpuInsight).toBeDefined();
    expect(cpuInsight!.category).toBe("resource-imbalance");
  });

  it(`marks critical when any cluster exceeds ${CPU_CRITICAL_THRESHOLD_PCT}%`, () => {
    const clusters = [
      makeCluster({ name: "cluster-1", cpuCores: 10, cpuUsageCores: 9 }), // 90% > 85%
      makeCluster({ name: "cluster-2", cpuCores: 10, cpuUsageCores: 2 }), // 20%
    ];
    const result = detectResourceImbalance(clusters);
    const cpuInsight = result.find((i) => i.title.includes("CPU"));
    expect(cpuInsight!.severity).toBe("critical");
  });

  it("detects memory imbalance", () => {
    const clusters = [
      makeCluster({
        name: "cluster-1",
        cpuCores: 8,
        memoryGB: 32,
        memoryUsageGB: 28,
      }), // 88%
      makeCluster({
        name: "cluster-2",
        cpuCores: 8,
        memoryGB: 32,
        memoryUsageGB: 5,
      }), // 16%
    ];
    const result = detectResourceImbalance(clusters);
    const memInsight = result.find((i) => i.title.includes("Memory"));
    expect(memInsight).toBeDefined();
  });

  it("skips unhealthy clusters", () => {
    const clusters = [
      makeCluster({
        name: "cluster-1",
        healthy: false,
        cpuCores: 10,
        cpuUsageCores: 9,
      }),
      makeCluster({ name: "cluster-2", cpuCores: 10, cpuUsageCores: 2 }),
    ];
    // Only 1 healthy cluster with cpuCores > 0, so it returns empty
    expect(detectResourceImbalance(clusters)).toEqual([]);
  });
});

// ── Algorithm 6: Restart Correlation ──────────────────────────────────

describe("detectRestartCorrelation", () => {
  it("returns empty for no issues", () => {
    expect(detectRestartCorrelation([])).toEqual([]);
  });

  it("handles undefined input gracefully", () => {
    expect(
      detectRestartCorrelation(undefined as unknown as PodIssue[]),
    ).toEqual([]);
  });

  it(`returns empty when restarts are below threshold (${RESTART_CORRELATION_THRESHOLD})`, () => {
    const issues = [makePodIssue({ restarts: 1 })];
    expect(detectRestartCorrelation(issues)).toEqual([]);
  });

  it("detects horizontal pattern (app bug): same workload across clusters", () => {
    const issues = [
      makePodIssue({
        name: "api-server-abc123-xyz",
        cluster: "cluster-1",
        restarts: 5,
      }),
      makePodIssue({
        name: "api-server-def456-uvw",
        cluster: "cluster-2",
        restarts: 3,
      }),
    ];
    const result = detectRestartCorrelation(issues);
    const appBug = result.find((i) => i.title.includes("app bug"));
    expect(appBug).toBeDefined();
    expect(appBug!.affectedClusters).toHaveLength(2);
  });

  it("detects vertical pattern (infra issue): multiple workloads in one cluster", () => {
    const issues = [
      makePodIssue({
        name: "api-server-abc-xyz",
        cluster: "cluster-1",
        restarts: 5,
      }),
      makePodIssue({
        name: "cache-redis-abc-xyz",
        cluster: "cluster-1",
        restarts: 4,
      }),
      makePodIssue({
        name: "worker-queue-abc-xyz",
        cluster: "cluster-1",
        restarts: 6,
      }),
    ];
    const result = detectRestartCorrelation(issues);
    const infraIssue = result.find((i) => i.title.includes("infra issue"));
    expect(infraIssue).toBeDefined();
    expect(infraIssue!.affectedClusters).toEqual(["cluster-1"]);
  });

  it(`escalates app bug to critical when total restarts > ${RESTART_CRITICAL_THRESHOLD}`, () => {
    const issues = [
      makePodIssue({
        name: "api-server-abc-xyz",
        cluster: "cluster-1",
        restarts: 15,
      }),
      makePodIssue({
        name: "api-server-def-uvw",
        cluster: "cluster-2",
        restarts: 10,
      }),
    ];
    const result = detectRestartCorrelation(issues);
    const appBug = result.find((i) => i.title.includes("app bug"));
    expect(appBug!.severity).toBe("critical");
  });

  it(`escalates infra issue to critical when ${INFRA_CRITICAL_WORKLOADS}+ workloads restarting`, () => {
    const issues = Array.from({ length: INFRA_CRITICAL_WORKLOADS }, (_, i) =>
      makePodIssue({
        name: `workload-${i}-abc-xyz`,
        cluster: "cluster-1",
        restarts: 5,
      }),
    );
    const result = detectRestartCorrelation(issues);
    const infraIssue = result.find((i) => i.title.includes("infra issue"));
    expect(infraIssue!.severity).toBe("critical");
  });
});

// ── Algorithm 7: Rollout Tracking ─────────────────────────────────────

describe("trackRolloutProgress", () => {
  it("returns empty for no deployments", () => {
    expect(trackRolloutProgress([])).toEqual([]);
  });

  it("handles undefined input gracefully", () => {
    expect(trackRolloutProgress(undefined as unknown as Deployment[])).toEqual(
      [],
    );
  });

  it("returns empty when all clusters have the same image", () => {
    const deps = [
      makeDeployment({ cluster: "cluster-1", image: "api:v1.0" }),
      makeDeployment({ cluster: "cluster-2", image: "api:v1.0" }),
    ];
    expect(trackRolloutProgress(deps)).toEqual([]);
  });

  it("detects in-progress rollout with mixed image versions", () => {
    const deps = [
      makeDeployment({ cluster: "cluster-1", image: "api:v2.0" }),
      makeDeployment({ cluster: "cluster-2", image: "api:v2.0" }),
      makeDeployment({ cluster: "cluster-3", image: "api:v1.0" }),
    ];
    const result = trackRolloutProgress(deps);
    expect(result).toHaveLength(1);
    expect(result[0].category).toBe("rollout-tracker");
    expect(result[0].metrics).toBeDefined();
    expect(result[0].metrics!.total).toBe(3);
  });

  it("sets severity to warning when a cluster has failed status", () => {
    const deps = [
      makeDeployment({ cluster: "cluster-1", image: "api:v2.0" }),
      makeDeployment({ cluster: "cluster-2", image: "api:v2.0" }),
      makeDeployment({
        cluster: "cluster-3",
        image: "api:v1.0",
        status: "failed",
      }),
    ];
    const result = trackRolloutProgress(deps);
    expect(result[0].severity).toBe("warning");
    expect(result[0].metrics!.failed).toBe(1);
  });

  it('treats most common image as "newest" (known behavior)', () => {
    // Documents the known behavior: during canary, the old image is more common
    const deps = [
      makeDeployment({ cluster: "cluster-1", image: "api:v1.0" }),
      makeDeployment({ cluster: "cluster-2", image: "api:v1.0" }),
      makeDeployment({ cluster: "cluster-3", image: "api:v1.0" }),
      makeDeployment({ cluster: "cluster-4", image: "api:v2.0" }), // canary
    ];
    const result = trackRolloutProgress(deps);
    // The "most common" image (v1.0) is treated as newest
    expect(result[0].metrics!.completed).toBe(3);
    expect(result[0].metrics!.pending).toBe(1);
  });

  it("verifies per-cluster completed/pending/failed breakdown", () => {
    const deps = [
      makeDeployment({
        cluster: "cluster-1",
        image: "api:v2.0",
        status: "running",
      }),
      makeDeployment({
        cluster: "cluster-2",
        image: "api:v2.0",
        status: "running",
      }),
      makeDeployment({
        cluster: "cluster-3",
        image: "api:v1.0",
        status: "running",
      }),
      makeDeployment({
        cluster: "cluster-4",
        image: "api:v1.0",
        status: "failed",
      }),
    ];
    const result = trackRolloutProgress(deps);
    expect(result).toHaveLength(1);
    // v2.0 appears 2 times, v1.0 appears 2 times — tie-break by sort order,
    // but both have same count so the first sorted wins. Regardless:
    const metrics = result[0].metrics!;
    expect(metrics.total).toBe(4);
    // completed + pending = total (failed is an orthogonal status check)
    expect(metrics.completed + metrics.pending).toBe(metrics.total);
    // Exactly 1 failed (cluster-4 has status: 'failed')
    expect(metrics.failed).toBe(1);
    // Verify affected clusters lists all 4
    expect(result[0].affectedClusters).toHaveLength(4);
  });
});
