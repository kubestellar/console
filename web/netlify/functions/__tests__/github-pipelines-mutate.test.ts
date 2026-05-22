/**
 * Vitest handler tests for github-pipelines-mutate.mts (#15397, Part of #4189).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertResponseHasNoSecrets,
  FAKE_MUTATE_AUTH_TOKEN,
  readJson,
} from "./netlify-handler-helpers";

const { mockEnforceSimpleRateLimit, mockMutate } = vi.hoisted(() => ({
  mockEnforceSimpleRateLimit: vi.fn(),
  mockMutate: vi.fn(),
}));

vi.mock("../_shared/rate-limit", () => ({
  enforceSimpleRateLimit: mockEnforceSimpleRateLimit,
}));

vi.mock("../github-pipelines/mutations", () => ({
  mutate: mockMutate,
}));

import handler from "../github-pipelines-mutate.mts";

function makeMutateRequest(options?: {
  method?: string;
  op?: string;
  repo?: string;
  run?: string;
  bearer?: string;
}): Request {
  const params = new URLSearchParams();
  if (options?.op) params.set("op", options.op);
  if (options?.repo) params.set("repo", options.repo);
  if (options?.run) params.set("run", options.run);
  const headers: Record<string, string> = { Origin: "https://console.kubestellar.io" };
  if (options?.bearer) {
    headers.Authorization = `Bearer ${options.bearer}`;
  }
  return new Request(`https://console.kubestellar.io/api/github-pipelines/mutate?${params}`, {
    method: options?.method ?? "POST",
    headers,
  });
}

describe("github-pipelines-mutate", () => {
  const originalMutateToken = process.env.GITHUB_PIPELINES_MUTATE_AUTH_TOKEN;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GITHUB_PIPELINES_MUTATE_AUTH_TOKEN = FAKE_MUTATE_AUTH_TOKEN;
    mockEnforceSimpleRateLimit.mockResolvedValue({ limited: false });
    mockMutate.mockResolvedValue(
      new Response(JSON.stringify({ ok: true, op: "rerun", run: "99", repo: "kubestellar/console" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  });

  afterEach(() => {
    if (originalMutateToken === undefined) {
      delete process.env.GITHUB_PIPELINES_MUTATE_AUTH_TOKEN;
    } else {
      process.env.GITHUB_PIPELINES_MUTATE_AUTH_TOKEN = originalMutateToken;
    }
  });

  it("returns 503 when mutation auth token is not configured", async () => {
    delete process.env.GITHUB_PIPELINES_MUTATE_AUTH_TOKEN;
    const res = await handler(makeMutateRequest({ bearer: FAKE_MUTATE_AUTH_TOKEN }));
    expect(res.status).toBe(503);
    const body = await readJson<{ error: string }>(res);
    expect(body.error).toContain("disabled");
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it("returns 401 without authorized credential", async () => {
    const res = await handler(makeMutateRequest({ op: "rerun", repo: "kubestellar/console", run: "12345" }));
    expect(res.status).toBe(401);
    const body = await readJson<{ error: string }>(res);
    expect(body.error).toContain("auth");
    expect(mockMutate).not.toHaveBeenCalled();
    assertResponseHasNoSecrets(JSON.stringify(body), [FAKE_MUTATE_AUTH_TOKEN]);
  });

  it("returns 400 for non-numeric run id before calling mutate", async () => {
    const res = await handler(
      makeMutateRequest({
        op: "rerun",
        repo: "kubestellar/console",
        run: "abc",
        bearer: FAKE_MUTATE_AUTH_TOKEN,
      }),
    );
    expect(res.status).toBe(400);
    const body = await readJson<{ error: string }>(res);
    expect(body.error).toContain("run");
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it("returns 429 when mutation rate limit is exceeded", async () => {
    mockEnforceSimpleRateLimit.mockResolvedValue({ limited: true, retryAfterSeconds: 120 });
    const res = await handler(
      makeMutateRequest({
        op: "rerun",
        repo: "kubestellar/console",
        run: "12345",
        bearer: FAKE_MUTATE_AUTH_TOKEN,
      }),
    );
    expect(res.status).toBe(429);
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it("forwards authorized rerun to mutate and returns success", async () => {
    const res = await handler(
      makeMutateRequest({
        op: "rerun",
        repo: "kubestellar/console",
        run: "12345",
        bearer: FAKE_MUTATE_AUTH_TOKEN,
      }),
    );
    expect(res.status).toBe(200);
    expect(mockMutate).toHaveBeenCalledWith("rerun", "kubestellar/console", "12345");
    const body = await readJson<{ ok: boolean }>(res);
    expect(body.ok).toBe(true);
    assertResponseHasNoSecrets(JSON.stringify(body), [FAKE_MUTATE_AUTH_TOKEN]);
  });

  it("returns 405 for GET", async () => {
    const res = await handler(
      makeMutateRequest({ method: "GET", bearer: FAKE_MUTATE_AUTH_TOKEN }),
    );
    expect(res.status).toBe(405);
  });
});
