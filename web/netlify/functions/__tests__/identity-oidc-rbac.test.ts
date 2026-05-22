/**
 * Vitest handler tests for identity OIDC + RBAC Netlify functions (#15399, Part of #4189).
 *
 * Run from web/: npm run test:netlify-identity
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertNoForbiddenIdentityFields,
  makeIdentityRequest,
  readJson,
} from "./netlify-handler-helpers";

import oidcSummaryHandler from "../identity-oidc-summary.mts";
import oidcProvidersHandler from "../identity-oidc-providers.mts";
import oidcSessionsHandler from "../identity-oidc-sessions.mts";
import rbacSummaryHandler from "../identity-rbac-summary.mts";
import rbacFindingsHandler from "../identity-rbac-findings.mts";

const API_OIDC_SUMMARY = "/api/identity/oidc/summary";
const API_OIDC_PROVIDERS = "/api/identity/oidc/providers";
const API_OIDC_SESSIONS = "/api/identity/oidc/sessions";
const API_RBAC_SUMMARY = "/api/identity/rbac/summary";
const API_RBAC_FINDINGS = "/api/identity/rbac/findings";

const INVALID_CLUSTER_SEARCH = "cluster=not valid!!!";

type HandlerFn = (req: Request) => Promise<Response>;

function runBadInputSuite(name: string, handler: HandlerFn, path: string) {
  describe(`${name} — bad input`, () => {
    it("returns 400 for invalid cluster query parameter", async () => {
      const res = await handler(makeIdentityRequest(path, { search: INVALID_CLUSTER_SEARCH }));
      expect(res.status).toBe(400);
      const body = await readJson<{ error: string }>(res);
      expect(body.error).toContain("Invalid cluster");
    });

    it("returns 405 for POST with Allow header", async () => {
      const res = await handler(makeIdentityRequest(path, { method: "POST" }));
      expect(res.status).toBe(405);
      expect(res.headers.get("Allow")).toBe("GET, OPTIONS");
      const body = await readJson<{ error: string }>(res);
      expect(body.error).toContain("Method not allowed");
    });
  });
}

describe("wrapIdentityDemoResponse — CORS preflight", () => {
  it("returns 204 OPTIONS with Access-Control-Allow-Methods and Allow-Headers", async () => {
    const res = await oidcSummaryHandler(
      makeIdentityRequest(API_OIDC_SUMMARY, { method: "OPTIONS" }),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Methods")).toBe("GET, OPTIONS");
    expect(res.headers.get("Access-Control-Allow-Headers")).toBe("Content-Type");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://console.kubestellar.io",
    );
  });
});

function runUpstreamErrorSuite(name: string, handler: HandlerFn, path: string) {
  describe(`${name} — upstream/serialization error`, () => {
    let stringifySpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      stringifySpy = vi.spyOn(JSON, "stringify").mockImplementation(() => {
        throw new Error("serialization failed");
      });
    });

    afterEach(() => {
      stringifySpy.mockRestore();
    });

    it("returns 502 when response JSON serialization fails", async () => {
      const res = await handler(makeIdentityRequest(path));
      expect(res.status).toBe(502);
      const raw = await res.text();
      expect(raw).toContain("unavailable");
      assertNoForbiddenIdentityFields(raw);
    });
  });
}

describe("identity-oidc-summary", () => {
  it("returns normalized OIDC summary shape on happy path", async () => {
    const res = await oidcSummaryHandler(makeIdentityRequest(API_OIDC_SUMMARY));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/json");

    const body = await readJson<{
      total_providers: number;
      active_providers: number;
      total_users: number;
      active_sessions: number;
      failed_logins_24h: number;
      mfa_adoption: number;
      evaluated_at: string;
    }>(res);

    expect(body.total_providers).toBeGreaterThan(0);
    expect(body.active_providers).toBeLessThanOrEqual(body.total_providers);
    expect(body.mfa_adoption).toBeGreaterThanOrEqual(0);
    expect(() => new Date(body.evaluated_at).toISOString()).not.toThrow();
    assertNoForbiddenIdentityFields(JSON.stringify(body));
  });

  runBadInputSuite("identity-oidc-summary", oidcSummaryHandler, API_OIDC_SUMMARY);
  runUpstreamErrorSuite("identity-oidc-summary", oidcSummaryHandler, API_OIDC_SUMMARY);
});

describe("identity-oidc-providers", () => {
  it("returns provider list with bindings metadata on happy path", async () => {
    const res = await oidcProvidersHandler(makeIdentityRequest(API_OIDC_PROVIDERS));
    expect(res.status).toBe(200);

    const body = await readJson<
      Array<{
        id: string;
        name: string;
        issuer_url: string;
        status: string;
        protocol: string;
        client_id: string;
        users_synced: number;
        groups_mapped: number;
      }>
    >(res);

    expect(body.length).toBeGreaterThanOrEqual(3);
    expect(body[0]).toMatchObject({
      id: expect.any(String),
      name: expect.any(String),
      issuer_url: expect.stringMatching(/^https:\/\//),
      status: expect.any(String),
      client_id: expect.any(String),
      groups_mapped: expect.any(Number),
    });
    assertNoForbiddenIdentityFields(JSON.stringify(body));
  });

  runBadInputSuite("identity-oidc-providers", oidcProvidersHandler, API_OIDC_PROVIDERS);
  runUpstreamErrorSuite("identity-oidc-providers", oidcProvidersHandler, API_OIDC_PROVIDERS);
});

describe("identity-oidc-sessions", () => {
  it("returns session list with active flag on happy path", async () => {
    const res = await oidcSessionsHandler(makeIdentityRequest(API_OIDC_SESSIONS));
    expect(res.status).toBe(200);

    const body = await readJson<
      Array<{
        id: string;
        user: string;
        provider_name: string;
        active: boolean;
        login_time: string;
        expires_at: string;
      }>
    >(res);

    expect(body.length).toBeGreaterThan(0);
    expect(body.some((s) => s.active)).toBe(true);
    expect(body.some((s) => !s.active)).toBe(true);
    assertNoForbiddenIdentityFields(JSON.stringify(body));
  });

  runBadInputSuite("identity-oidc-sessions", oidcSessionsHandler, API_OIDC_SESSIONS);
  runUpstreamErrorSuite("identity-oidc-sessions", oidcSessionsHandler, API_OIDC_SESSIONS);
});

describe("identity-rbac-summary", () => {
  it("returns RBAC summary with binding counts on happy path", async () => {
    const res = await rbacSummaryHandler(makeIdentityRequest(API_RBAC_SUMMARY));
    expect(res.status).toBe(200);

    const body = await readJson<{
      total_bindings: number;
      cluster_role_bindings: number;
      role_bindings: number;
      over_privileged: number;
      unused_bindings: number;
      compliance_score: number;
      evaluated_at: string;
    }>(res);

    expect(body.total_bindings).toBe(
      body.cluster_role_bindings + body.role_bindings,
    );
    expect(body.compliance_score).toBeGreaterThanOrEqual(0);
    expect(body.compliance_score).toBeLessThanOrEqual(100);
    assertNoForbiddenIdentityFields(JSON.stringify(body));
  });

  runBadInputSuite("identity-rbac-summary", rbacSummaryHandler, API_RBAC_SUMMARY);
  runUpstreamErrorSuite("identity-rbac-summary", rbacSummaryHandler, API_RBAC_SUMMARY);
});

describe("identity-rbac-findings", () => {
  it("returns findings with severity and cluster on happy path", async () => {
    const res = await rbacFindingsHandler(makeIdentityRequest(API_RBAC_FINDINGS));
    expect(res.status).toBe(200);

    const body = await readJson<
      Array<{
        id: string;
        finding_type: string;
        severity: string;
        subject: string;
        cluster: string;
        recommendation: string;
      }>
    >(res);

    expect(body.length).toBeGreaterThan(0);
    const severities = new Set(body.map((f) => f.severity));
    expect(severities.has("critical")).toBe(true);
    expect(body.every((f) => f.cluster.length > 0)).toBe(true);
    assertNoForbiddenIdentityFields(JSON.stringify(body));
  });

  runBadInputSuite("identity-rbac-findings", rbacFindingsHandler, API_RBAC_FINDINGS);
  runUpstreamErrorSuite("identity-rbac-findings", rbacFindingsHandler, API_RBAC_FINDINGS);
});
