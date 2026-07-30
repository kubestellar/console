// @vitest-environment node
/**
 * @vitest-environment node
 *
 * Tests for health.mts. Two concerns:
 *
 * 1. Response shape — the boot sequence in useSidebarConfig.ts depends on
 *    specific keys (project, workloads.quantum_kc_demo_available,
 *    enabled_dashboards). A regression in any of them breaks sidebar
 *    promotion of discoverable dashboards (e.g. Quantum Demo) on
 *    console.kubestellar.io.
 * 2. Three-way parity with pkg/api/projects.go — the kubestellar dashboard
 *    preset is duplicated across Go, this .mts file, and the MSW handler.
 *    These tests read all three files and assert order-preserving equality
 *    so silent drift fails CI.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { makeNetlifyRequest, readJson } from "./netlify-handler-helpers";
import handler from "../health.mts";

const HEALTH_PATH = "/health";

interface HealthResponse {
  status: string;
  version: string;
  oauth_configured: boolean;
  in_cluster: boolean;
  no_local_agent: boolean;
  install_method: string;
  project: string;
  workloads: { quantum_kc_demo_available: boolean };
  branding: Record<string, unknown>;
  enabled_dashboards: string[];
}

describe("health response shape", () => {
  it("returns 200 with JSON body", async () => {
    const res = await handler(makeNetlifyRequest(HEALTH_PATH));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
  });

  it("project = kubestellar (drives branding flags + dashboard preset lookup)", async () => {
    const res = await handler(makeNetlifyRequest(HEALTH_PATH));
    const body = await readJson<HealthResponse>(res);
    expect(body.project).toBe("kubestellar");
  });

  it("quantum_kc_demo_available is boolean false (forces quantum cards to demo)", async () => {
    const res = await handler(makeNetlifyRequest(HEALTH_PATH));
    const body = await readJson<HealthResponse>(res);
    expect(body.workloads.quantum_kc_demo_available).toBe(false);
  });

  it("enabled_dashboards includes quantum (drives sidebar promotion)", async () => {
    const res = await handler(makeNetlifyRequest(HEALTH_PATH));
    const body = await readJson<HealthResponse>(res);
    expect(Array.isArray(body.enabled_dashboards)).toBe(true);
    expect(body.enabled_dashboards).toContain("quantum");
  });

  it("OPTIONS preflight returns 204 for allowed origins", async () => {
    const res = await handler(
      makeNetlifyRequest(HEALTH_PATH, { method: "OPTIONS" }),
    );
    expect(res.status).toBe(204);
  });

  it("non-GET/non-OPTIONS methods return 405 with Allow header", async () => {
    const res = await handler(
      makeNetlifyRequest(HEALTH_PATH, { method: "POST" }),
    );
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("GET, OPTIONS");
  });

  it("uses CORS allowlist (echoes allowed Origin, never blanket *)", async () => {
    // Smoke test for the OWASP-ZAP-driven allowlist (_shared/cors.ts).
    // Without an allowed Origin header, no Access-Control-Allow-Origin is set.
    // With an allowed Origin, it is echoed back exactly (never `*`).
    const allowedOriginRes = await handler(
      makeNetlifyRequest(HEALTH_PATH, {
        origin: "https://console.kubestellar.io",
      }),
    );
    expect(allowedOriginRes.headers.get("access-control-allow-origin"))
      .toBe("https://console.kubestellar.io");
    expect(allowedOriginRes.headers.get("vary")).toContain("Origin");
  });
});

describe("health parity with pkg/api/projects.go", () => {
  /** Extract the kubestellar preset from pkg/api/projects.go in source order. */
  function readGoPreset(): string[] {
    const goSource = readFileSync(
      resolve(__dirname, "../../../../pkg/api/projects.go"),
      "utf8",
    );
    const blockMatch = goSource.match(/"kubestellar":\s*\{([\s\S]*?)\}/);
    if (!blockMatch) {
      throw new Error("could not find kubestellar preset in pkg/api/projects.go");
    }
    return Array.from(blockMatch[1].matchAll(/"([a-z-]+)"/g)).map((m) => m[1]);
  }

  /** Extract the KUBESTELLAR_DASHBOARDS const from health.mts in source order. */
  function readMtsPreset(): string[] {
    const mtsSource = readFileSync(
      resolve(__dirname, "../health.mts"),
      "utf8",
    );
    const blockMatch = mtsSource.match(
      /KUBESTELLAR_DASHBOARDS\s*=\s*\[([\s\S]*?)\]/,
    );
    if (!blockMatch) {
      throw new Error("could not find KUBESTELLAR_DASHBOARDS in health.mts");
    }
    return Array.from(blockMatch[1].matchAll(/"([a-z-]+)"/g)).map((m) => m[1]);
  }

  it("health.mts list matches pkg/api/projects.go exactly (order-preserving)", () => {
    expect(readMtsPreset()).toEqual(readGoPreset());
  });

  it("response body's enabled_dashboards matches the Go preset exactly", async () => {
    const res = await handler(makeNetlifyRequest(HEALTH_PATH));
    const body = await readJson<HealthResponse>(res);
    expect(body.enabled_dashboards).toEqual(readGoPreset());
  });

  it("MSW handler in handlers.platform.ts matches the Go preset exactly", () => {
    // Guards against drift in the third copy (used by demo-mode dev/test
    // runs that don't go through netlify dev). The /health MSW handler
    // lives in handlers.platform.ts alongside the other root-level
    // boot-time mocks (useBackendHealth, useBranding, useSelfUpgrade).
    const goList = readGoPreset();
    const mswSource = readFileSync(
      resolve(__dirname, "../../../src/mocks/handlers.platform.ts"),
      "utf8",
    );
    const blockMatch = mswSource.match(
      /enabled_dashboards:\s*\[([\s\S]*?)\]/,
    );
    expect(blockMatch).not.toBeNull();
    const mswList = Array.from(
      blockMatch![1].matchAll(/'([a-z-]+)'/g),
    ).map((m) => m[1]);
    expect(mswList).toEqual(goList);
  });

  it("handlers.endpoints.ts does NOT define a duplicate /health handler", () => {
    // Regression guard: a duplicate handler would shadow the canonical one
    // in handlers.platform.ts because MSW takes the first-registered match.
    // This bit a prior iteration of this PR (caught by reviewer comparison
    // on PR #17569).
    const endpointsSource = readFileSync(
      resolve(__dirname, "../../../src/mocks/handlers.endpoints.ts"),
      "utf8",
    );
    expect(endpointsSource).not.toMatch(/http\.get\(\s*['"]\/health['"]/);
  });
});
