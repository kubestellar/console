// @vitest-environment node
/**
 * Unit tests for supply-chain SBOM and license Netlify functions.
 *
 * These functions serve static demo data for the supply chain dashboard.
 * Tests verify response structure, field types, and HTTP method handling.
 */
import { describe, expect, it } from "vitest";

import sbomDocuments from "../supply-chain-sbom-documents.mts";
import sbomSummary from "../supply-chain-sbom-summary.mts";
import licensesCategories from "../supply-chain-licenses-categories.mts";
import licensesPackages from "../supply-chain-licenses-packages.mts";
import licensesSummary from "../supply-chain-licenses-summary.mts";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(method: string, url = "https://console.kubestellar.io/api"): Request {
  return new Request(url, {
    method,
    headers: { Origin: "https://console.kubestellar.io" },
  });
}

async function parseJson(res: Response): Promise<unknown> {
  return res.json();
}

// ── SBOM Documents ───────────────────────────────────────────────────────────

describe("supply-chain-sbom-documents", () => {
  it("returns 200 for GET", async () => {
    const res = await sbomDocuments(makeRequest("GET"));
    expect(res.status).toBe(200);
  });

  it("returns an array of SBOM documents", async () => {
    const res = await sbomDocuments(makeRequest("GET"));
    const data = await parseJson(res) as Array<unknown>;
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
  });

  it("each document has required fields", async () => {
    const res = await sbomDocuments(makeRequest("GET"));
    const data = await parseJson(res) as Array<Record<string, unknown>>;
    for (const doc of data) {
      expect(doc).toHaveProperty("id");
      expect(doc).toHaveProperty("workload");
      expect(doc).toHaveProperty("namespace");
      expect(doc).toHaveProperty("cluster");
      expect(doc).toHaveProperty("format");
      expect(doc).toHaveProperty("generated_at");
      expect(doc).toHaveProperty("component_count");
      expect(doc).toHaveProperty("vulnerable_count");
      expect(doc).toHaveProperty("components");
    }
  });

  it("components have purl and license fields", async () => {
    const res = await sbomDocuments(makeRequest("GET"));
    const data = await parseJson(res) as Array<{ components: Array<Record<string, unknown>> }>;
    const firstDoc = data[0];
    expect(firstDoc.components.length).toBeGreaterThan(0);
    for (const comp of firstDoc.components) {
      expect(comp).toHaveProperty("name");
      expect(comp).toHaveProperty("version");
      expect(comp).toHaveProperty("purl");
      expect(comp).toHaveProperty("license");
      expect(comp).toHaveProperty("vulnerabilities");
      expect(comp).toHaveProperty("severity");
    }
  });

  it("format is SPDX or CycloneDX", async () => {
    const res = await sbomDocuments(makeRequest("GET"));
    const data = await parseJson(res) as Array<{ format: string }>;
    for (const doc of data) {
      expect(["SPDX", "CycloneDX"]).toContain(doc.format);
    }
  });

  it("returns 405 for POST", async () => {
    const res = await sbomDocuments(makeRequest("POST"));
    expect(res.status).toBe(405);
  });

  it("returns 405 for DELETE", async () => {
    const res = await sbomDocuments(makeRequest("DELETE"));
    expect(res.status).toBe(405);
  });
});

// ── SBOM Summary ─────────────────────────────────────────────────────────────

describe("supply-chain-sbom-summary", () => {
  it("returns 200 for GET", async () => {
    const res = await sbomSummary(makeRequest("GET"));
    expect(res.status).toBe(200);
  });

  it("returns summary object with required fields", async () => {
    const res = await sbomSummary(makeRequest("GET"));
    const data = await parseJson(res) as Record<string, unknown>;
    expect(data).toHaveProperty("total_workloads");
    expect(data).toHaveProperty("sbom_coverage");
    expect(data).toHaveProperty("total_components");
    expect(data).toHaveProperty("vulnerable_components");
    expect(data).toHaveProperty("critical_count");
    expect(data).toHaveProperty("high_count");
    expect(data).toHaveProperty("generated_at");
  });

  it("numeric fields are numbers", async () => {
    const res = await sbomSummary(makeRequest("GET"));
    const data = await parseJson(res) as Record<string, unknown>;
    expect(typeof data.total_workloads).toBe("number");
    expect(typeof data.sbom_coverage).toBe("number");
    expect(typeof data.total_components).toBe("number");
    expect(typeof data.vulnerable_components).toBe("number");
  });

  it("returns 405 for PUT", async () => {
    const res = await sbomSummary(makeRequest("PUT"));
    expect(res.status).toBe(405);
  });
});

// ── Licenses Categories ──────────────────────────────────────────────────────

describe("supply-chain-licenses-categories", () => {
  it("returns 200 for GET", async () => {
    const res = await licensesCategories(makeRequest("GET"));
    expect(res.status).toBe(200);
  });

  it("returns an array of license categories", async () => {
    const res = await licensesCategories(makeRequest("GET"));
    const data = await parseJson(res) as Array<unknown>;
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
  });

  it("each category has name, count, risk, and examples", async () => {
    const res = await licensesCategories(makeRequest("GET"));
    const data = await parseJson(res) as Array<Record<string, unknown>>;
    for (const cat of data) {
      expect(cat).toHaveProperty("name");
      expect(cat).toHaveProperty("count");
      expect(cat).toHaveProperty("risk");
      expect(cat).toHaveProperty("examples");
      expect(typeof cat.count).toBe("number");
      expect(["allowed", "warn", "denied"]).toContain(cat.risk);
      expect(Array.isArray(cat.examples)).toBe(true);
    }
  });

  it("returns 405 for POST", async () => {
    const res = await licensesCategories(makeRequest("POST"));
    expect(res.status).toBe(405);
  });
});

// ── Licenses Packages ────────────────────────────────────────────────────────

describe("supply-chain-licenses-packages", () => {
  it("returns 200 for GET", async () => {
    const res = await licensesPackages(makeRequest("GET"));
    expect(res.status).toBe(200);
  });

  it("returns an array of packages", async () => {
    const res = await licensesPackages(makeRequest("GET"));
    const data = await parseJson(res) as Array<unknown>;
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
  });

  it("each package has required license fields", async () => {
    const res = await licensesPackages(makeRequest("GET"));
    const data = await parseJson(res) as Array<Record<string, unknown>>;
    for (const pkg of data) {
      expect(pkg).toHaveProperty("name");
      expect(pkg).toHaveProperty("version");
      expect(pkg).toHaveProperty("license");
      expect(pkg).toHaveProperty("risk");
      expect(pkg).toHaveProperty("workload");
      expect(pkg).toHaveProperty("namespace");
      expect(pkg).toHaveProperty("cluster");
      expect(pkg).toHaveProperty("spdx_id");
      expect(["allowed", "warn", "denied"]).toContain(pkg.risk);
    }
  });

  it("includes packages from multiple risk levels", async () => {
    const res = await licensesPackages(makeRequest("GET"));
    const data = await parseJson(res) as Array<{ risk: string }>;
    const risks = new Set(data.map(p => p.risk));
    expect(risks.has("allowed")).toBe(true);
    expect(risks.has("warn")).toBe(true);
    expect(risks.has("denied")).toBe(true);
  });

  it("returns 405 for PATCH", async () => {
    const res = await licensesPackages(makeRequest("PATCH"));
    expect(res.status).toBe(405);
  });
});

// ── Licenses Summary ─────────────────────────────────────────────────────────

describe("supply-chain-licenses-summary", () => {
  it("returns 200 for GET", async () => {
    const res = await licensesSummary(makeRequest("GET"));
    expect(res.status).toBe(200);
  });

  it("returns summary object with required fields", async () => {
    const res = await licensesSummary(makeRequest("GET"));
    const data = await parseJson(res) as Record<string, unknown>;
    expect(data).toHaveProperty("total_packages");
    expect(data).toHaveProperty("allowed_packages");
    expect(data).toHaveProperty("warned_packages");
    expect(data).toHaveProperty("denied_packages");
    expect(data).toHaveProperty("unique_licenses");
    expect(data).toHaveProperty("workloads_scanned");
    expect(data).toHaveProperty("evaluated_at");
  });

  it("counts are consistent (allowed + warned + denied <= total)", async () => {
    const res = await licensesSummary(makeRequest("GET"));
    const data = await parseJson(res) as {
      total_packages: number;
      allowed_packages: number;
      warned_packages: number;
      denied_packages: number;
    };
    const sum = data.allowed_packages + data.warned_packages + data.denied_packages;
    expect(sum).toBeLessThanOrEqual(data.total_packages);
  });

  it("returns 405 for DELETE", async () => {
    const res = await licensesSummary(makeRequest("DELETE"));
    expect(res.status).toBe(405);
  });
});

// ── Cluster parameter validation (via shared wrapper) ────────────────────────

describe("supply-chain endpoints — cluster parameter validation", () => {
  it("accepts valid cluster parameter", async () => {
    const url = "https://console.kubestellar.io/api?cluster=prod-east";
    const res = await sbomDocuments(makeRequest("GET", url));
    expect(res.status).toBe(200);
  });

  it("rejects invalid cluster parameter with special chars", async () => {
    const url = "https://console.kubestellar.io/api?cluster=../etc/passwd";
    const res = await sbomDocuments(makeRequest("GET", url));
    expect(res.status).toBe(400);
    const data = await parseJson(res) as { error: string };
    expect(data.error).toContain("Invalid cluster parameter");
  });

  it("allows empty cluster parameter", async () => {
    const url = "https://console.kubestellar.io/api?cluster=";
    const res = await sbomSummary(makeRequest("GET", url));
    expect(res.status).toBe(200);
  });
});
