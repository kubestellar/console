import { describe, it, expect, vi, afterEach } from "vitest"
import {
  buildClusters,
  buildDataFlows,
  resolveFlowColor,
  translations,
  CROSS_CLUSTER_CONNECTION_CHANCE,
  type ClusterConfig,
  type DataFlow,
} from "./NetworkGlobe.geometry"
import { COLORS } from "./colors"

describe("NetworkGlobe.geometry", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("buildClusters", () => {
    const clusters = buildClusters()

    it("returns exactly 5 clusters", () => {
      expect(clusters).toHaveLength(5)
    })

    it("uses the expected names from translations.clusters (regression pin)", () => {
      const names = clusters.map((c) => c.name)
      expect(names).toEqual([
        translations.clusters.kubeflexCore.name,
        translations.clusters.edgeClusters.name,
        translations.clusters.productionCluster.name,
        translations.clusters.devTestCluster.name,
        translations.clusters.multiCloudHub.name,
      ])
    })

    it("pins each cluster's fixed position (regression pin)", () => {
      expect(clusters.map((c) => c.position)).toEqual([
        [0, 3, 0],
        [3, 0, 0],
        [0, -3, 0],
        [-3, 0, 0],
        [2, 2, -2],
      ])
    })

    it("assigns each cluster a color that comes from COLORS", () => {
      const colorValues = Object.values(COLORS)
      for (const cluster of clusters) {
        expect(colorValues).toContain(cluster.color)
      }
    })

    it("returns a fresh array on each call (no shared mutable state)", () => {
      const a = buildClusters()
      const b = buildClusters()
      expect(a).not.toBe(b)
      expect(a).toEqual(b)
    })

    it("gives every cluster a positive nodeCount and radius", () => {
      for (const cluster of clusters) {
        expect(cluster.nodeCount).toBeGreaterThan(0)
        expect(cluster.radius).toBeGreaterThan(0)
      }
    })
  })

  describe("buildDataFlows", () => {
    it("produces central-hub + deterministic cross-cluster flows when Math.random disables the random branch (clusters.length >= 4)", () => {
      // Math.random() returning 0 means 0 > 0.7 is false, so the random
      // cross-cluster branch is skipped — leaving only the deterministic flows.
      vi.spyOn(Math, "random").mockReturnValue(0)

      const clusters = buildClusters()
      const flows = buildDataFlows(clusters)

      // 5 central-hub flows (one per cluster) + 3 deterministic cross-cluster flows
      expect(flows).toHaveLength(clusters.length + 3)

      // First N flows are the central-hub "control" flows, one per cluster,
      // paths going from origin [0,0,0] to each cluster's position.
      const central: ClusterPosition = [0, 0, 0]
      for (let i = 0; i < clusters.length; i++) {
        expect(flows[i]).toMatchObject({
          id: i,
          type: "control",
          path: [central, clusters[i].position],
        })
      }

      // Deterministic cross-cluster flows come next (production→edge, dev→edge, test→production).
      const deterministic = flows.slice(clusters.length)
      expect(deterministic.map((f) => f.type)).toEqual([
        "workload",
        "control",
        "deploy",
      ])
      expect(deterministic[0].path).toEqual([
        clusters[2].position,
        clusters[1].position,
      ])
      expect(deterministic[1].path).toEqual([
        clusters[0].position,
        clusters[1].position,
      ])
      expect(deterministic[2].path).toEqual([
        clusters[3].position,
        clusters[2].position,
      ])
    })

    it("emits every possible cross-cluster random 'data' flow when Math.random forces the branch", () => {
      // Math.random() returning 1 means 1 > 0.7 is true, so every (i,j) pair
      // with i < j fires the random cross-cluster branch.
      vi.spyOn(Math, "random").mockReturnValue(1)

      const clusters = buildClusters()
      const flows = buildDataFlows(clusters)

      // 5 central-hub + 3 deterministic + C(5,2)=10 random data flows.
      const nPairs = (clusters.length * (clusters.length - 1)) / 2
      expect(flows).toHaveLength(clusters.length + 3 + nPairs)

      const dataFlows = flows.filter((f) => f.type === "data")
      expect(dataFlows).toHaveLength(nPairs)
    })

    it("skips the deterministic cross-cluster block when clusters.length < 4", () => {
      vi.spyOn(Math, "random").mockReturnValue(0)

      const small: ClusterConfig[] = [
        {
          name: "a",
          position: [1, 0, 0],
          nodeCount: 1,
          radius: 1,
          color: COLORS.primary,
          description: "",
        },
        {
          name: "b",
          position: [0, 1, 0],
          nodeCount: 1,
          radius: 1,
          color: COLORS.primary,
          description: "",
        },
        {
          name: "c",
          position: [0, 0, 1],
          nodeCount: 1,
          radius: 1,
          color: COLORS.primary,
          description: "",
        },
      ]

      const flows = buildDataFlows(small)

      // Only the 3 central-hub "control" flows — no deterministic block, no random block.
      expect(flows).toHaveLength(small.length)
      expect(flows.every((f) => f.type === "control")).toBe(true)
    })

    it("returns an empty array for an empty cluster list", () => {
      expect(buildDataFlows([])).toEqual([])
    })

    it("every returned flow has a two-endpoint path and a valid type", () => {
      vi.spyOn(Math, "random").mockReturnValue(1)

      const clusters = buildClusters()
      const flows = buildDataFlows(clusters)
      const validTypes: DataFlow["type"][] = [
        "control",
        "workload",
        "deploy",
        "data",
      ]

      for (const flow of flows) {
        expect(flow.path).toHaveLength(2)
        expect(validTypes).toContain(flow.type)
      }
    })

    it("uses CROSS_CLUSTER_CONNECTION_CHANCE as the random-branch threshold (guard against off-by-one)", () => {
      // Exactly at the threshold — 0.7 > 0.7 is false, branch does not fire.
      vi.spyOn(Math, "random").mockReturnValue(CROSS_CLUSTER_CONNECTION_CHANCE)

      const clusters = buildClusters()
      const flows = buildDataFlows(clusters)

      // No random "data" flows should be added at exactly the threshold.
      expect(flows.filter((f) => f.type === "data")).toHaveLength(0)
    })
  })

  describe("resolveFlowColor", () => {
    it("returns COLORS.primary for any type when inactive", () => {
      for (const type of ["control", "workload", "deploy", "data"] as const) {
        expect(resolveFlowColor(type, false)).toBe(COLORS.primary)
      }
    })

    it("maps each active type to its expected color", () => {
      expect(resolveFlowColor("workload", true)).toBe(COLORS.success)
      expect(resolveFlowColor("deploy", true)).toBe(COLORS.accent1)
      expect(resolveFlowColor("control", true)).toBe(COLORS.secondary)
    })

    it("falls back to COLORS.highlight for the 'data' (default) active type", () => {
      expect(resolveFlowColor("data", true)).toBe(COLORS.highlight)
    })
  })
})

// Local type alias so the test compiles without re-exporting from the SUT.
type ClusterPosition = [number, number, number]
