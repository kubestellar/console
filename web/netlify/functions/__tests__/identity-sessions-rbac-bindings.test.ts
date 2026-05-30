/**
 * Vitest handler tests for identity sessions + RBAC bindings Netlify functions (#16128).
 *
 * Covers endpoints NOT tested by identity-oidc-rbac.test.ts:
 * - identity-rbac-bindings
 * - identity-sessions-active
 * - identity-sessions-policies
 * - identity-sessions-summary
 */
import { describe, expect, it } from "vitest";
import {
  assertNoForbiddenIdentityFields,
  makeIdentityRequest,
  readJson,
} from "./netlify-handler-helpers";

import rbacBindingsHandler from "../identity-rbac-bindings.mts";
import sessionsActiveHandler from "../identity-sessions-active.mts";
import sessionsPoliciesHandler from "../identity-sessions-policies.mts";
import sessionsSummaryHandler from "../identity-sessions-summary.mts";

const API_RBAC_BINDINGS = "/api/identity/rbac/bindings";
const API_SESSIONS_ACTIVE = "/api/identity/sessions/active";
const API_SESSIONS_POLICIES = "/api/identity/sessions/policies";
const API_SESSIONS_SUMMARY = "/api/identity/sessions/summary";

type HandlerFn = (req: Request) => Promise<Response>;

function runCommonSuite(name: string, handler: HandlerFn, path: string) {
  describe(`${name} — method handling`, () => {
    it("returns 405 for POST with Allow header", async () => {
      const res = await handler(makeIdentityRequest(path, { method: "POST" }));
      expect(res.status).toBe(405);
      expect(res.headers.get("Allow")).toBe("GET, OPTIONS");
      const body = await readJson<{ error: string }>(res);
      expect(body.error).toContain("Method not allowed");
    });

    it("returns 204 OPTIONS with CORS headers", async () => {
      const res = await handler(makeIdentityRequest(path, { method: "OPTIONS" }));
      expect(res.status).toBe(204);
      expect(res.headers.get("Access-Control-Allow-Methods")).toBe("GET, OPTIONS");
    });
  });
}

describe("identity-rbac-bindings", () => {
  it("returns binding list with expected shape on happy path", async () => {
    const res = await rbacBindingsHandler(makeIdentityRequest(API_RBAC_BINDINGS));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/json");

    const body = await readJson<
      Array<{
        id: string;
        name: string;
        kind: string;
        subject_kind: string;
        subject_name: string;
        role_name: string;
        namespace: string;
        cluster: string;
        risk_level: string;
        last_used: string;
      }>
    >(res);

    expect(body.length).toBeGreaterThan(0);
    expect(body[0]).toMatchObject({
      id: expect.any(String),
      name: expect.any(String),
      kind: expect.stringMatching(/^(ClusterRoleBinding|RoleBinding)$/),
      subject_kind: expect.any(String),
      role_name: expect.any(String),
      cluster: expect.any(String),
      risk_level: expect.stringMatching(/^(critical|high|medium|low)$/),
    });
    assertNoForbiddenIdentityFields(JSON.stringify(body));
  });

  runCommonSuite("identity-rbac-bindings", rbacBindingsHandler, API_RBAC_BINDINGS);
});

describe("identity-sessions-active", () => {
  it("returns active session list with expected shape on happy path", async () => {
    const res = await sessionsActiveHandler(makeIdentityRequest(API_SESSIONS_ACTIVE));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/json");

    const body = await readJson<
      Array<{
        id: string;
        user: string;
        login_time: string;
        last_activity: string;
        ip_address: string;
        user_agent: string;
        provider: string;
        status: string;
        expires_at: string;
      }>
    >(res);

    expect(body.length).toBeGreaterThan(0);
    expect(body[0]).toMatchObject({
      id: expect.any(String),
      user: expect.stringContaining("@"),
      provider: expect.any(String),
      status: expect.stringMatching(/^(active|idle|expired)$/),
    });
    expect(() => new Date(body[0].login_time).toISOString()).not.toThrow();
    expect(() => new Date(body[0].expires_at).toISOString()).not.toThrow();
    assertNoForbiddenIdentityFields(JSON.stringify(body));
  });

  runCommonSuite("identity-sessions-active", sessionsActiveHandler, API_SESSIONS_ACTIVE);
});

describe("identity-sessions-policies", () => {
  it("returns policy list with expected shape on happy path", async () => {
    const res = await sessionsPoliciesHandler(makeIdentityRequest(API_SESSIONS_POLICIES));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/json");

    const body = await readJson<
      Array<{
        id: string;
        name: string;
        description: string;
        idle_timeout_minutes: number;
        absolute_timeout_hours: number;
        max_concurrent: number;
        enforce_mfa: boolean;
        scope: string;
      }>
    >(res);

    expect(body.length).toBeGreaterThanOrEqual(3);
    expect(body[0]).toMatchObject({
      id: expect.any(String),
      name: expect.any(String),
      idle_timeout_minutes: expect.any(Number),
      absolute_timeout_hours: expect.any(Number),
      max_concurrent: expect.any(Number),
      enforce_mfa: expect.any(Boolean),
      scope: expect.any(String),
    });
    assertNoForbiddenIdentityFields(JSON.stringify(body));
  });

  runCommonSuite("identity-sessions-policies", sessionsPoliciesHandler, API_SESSIONS_POLICIES);
});

describe("identity-sessions-summary", () => {
  it("returns session summary object with expected shape on happy path", async () => {
    const res = await sessionsSummaryHandler(makeIdentityRequest(API_SESSIONS_SUMMARY));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/json");

    const body = await readJson<{
      active_sessions: number;
      unique_users: number;
      avg_duration_minutes: number;
      sessions_terminated_24h: number;
      policy_violations: number;
      mfa_sessions_pct: number;
      evaluated_at: string;
    }>(res);

    expect(body.active_sessions).toBeGreaterThan(0);
    expect(body.unique_users).toBeLessThanOrEqual(body.active_sessions);
    expect(body.mfa_sessions_pct).toBeGreaterThanOrEqual(0);
    expect(body.mfa_sessions_pct).toBeLessThanOrEqual(100);
    expect(() => new Date(body.evaluated_at).toISOString()).not.toThrow();
    assertNoForbiddenIdentityFields(JSON.stringify(body));
  });

  runCommonSuite("identity-sessions-summary", sessionsSummaryHandler, API_SESSIONS_SUMMARY);
});
