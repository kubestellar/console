/**
 * Vitest handler tests for analytics-dashboard.mts (#15403, Part of #4189).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertResponseHasNoSecrets,
  makeNetlifyRequest,
  readJson,
} from "./netlify-handler-helpers";
import type { DashboardData } from "../_shared/analytics-dashboard-types";

const { mockGet, mockSet } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockSet: vi.fn(),
}));

const { mockFetchDashboardData, mockGetAccessToken } = vi.hoisted(() => ({
  mockFetchDashboardData: vi.fn(),
  mockGetAccessToken: vi.fn(),
}));

vi.mock("@netlify/blobs", () => ({
  getStore: () => ({ get: mockGet, set: mockSet }),
}));

vi.mock("../_shared/analytics-dashboard", () => ({
  fetchDashboardData: mockFetchDashboardData,
  CACHE_KEY_PREFIX: "dashboard-data",
  CACHE_STORE: "analytics-dashboard",
  CACHE_TTL_MS: 900_000,
}));

vi.mock("../_shared/analytics-dashboard-auth", () => ({
  getAccessToken: mockGetAccessToken,
}));

import handler from "../analytics-dashboard.mts";

const API_ANALYTICS_DASHBOARD = "/api/analytics-dashboard";

const FAKE_PRIVATE_KEY = "-----BEGIN PRIVATE KEY-----\nMOCK_KEY\n-----END PRIVATE KEY-----\n";
const FAKE_SERVICE_ACCOUNT = {
  client_email: "analytics@test.iam.gserviceaccount.com",
  private_key: FAKE_PRIVATE_KEY,
  project_id: "test-project",
};
const FAKE_SA_B64 = Buffer.from(JSON.stringify(FAKE_SERVICE_ACCOUNT)).toString("base64");

const EMPTY_DASHBOARD: DashboardData = {
  overview: {
    activeUsers: 0,
    sessions: 0,
    pageViews: 0,
    avgEngagementTime: 0,
    bounceRate: 0,
    eventsPerSession: 0,
  },
  overviewPrevious: {
    activeUsers: 0,
    sessions: 0,
    pageViews: 0,
    avgEngagementTime: 0,
    bounceRate: 0,
    eventsPerSession: 0,
  },
  dailyUsers: [],
  topPages: [],
  topEvents: [],
  countries: [],
  trafficSources: [],
  devices: [],
  funnel: {
    landing: 0,
    login: 0,
    commandCopied: 0,
    agentConnected: 0,
    fixerViewed: 0,
    missionStarted: 0,
  },
  cncfOutreach: [],
  engagementByPage: [],
  newVsReturning: [],
  missions: {
    started: 0,
    completed: 0,
    errored: 0,
    rated: 0,
    topTypes: [],
  },
  cardPopularity: [],
  featureAdoption: [],
  weeklyRetention: [],
  errors: [],
  dailyFunnel: [],
  cachedAt: new Date().toISOString(),
  propertyId: "525401563",
  dateRange: "28daysAgo - today",
};

const BUCKETED_DASHBOARD: DashboardData = {
  ...EMPTY_DASHBOARD,
  dailyUsers: [
    { date: "20260501", users: 10, sessions: 12 },
    { date: "20260502", users: 5, sessions: 6 },
  ],
  overview: {
    activeUsers: 15,
    sessions: 18,
    pageViews: 40,
    avgEngagementTime: 120,
    bounceRate: 0.25,
    eventsPerSession: 2.1,
  },
};

describe("analytics-dashboard", () => {
  let envGet: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue(null);
    mockSet.mockResolvedValue(undefined);
    mockGetAccessToken.mockResolvedValue("ya29.mock-token");
    mockFetchDashboardData.mockResolvedValue(BUCKETED_DASHBOARD);

    envGet = vi.fn((key: string) => {
      if (key === "GA4_SERVICE_ACCOUNT_JSON") return FAKE_SA_B64;
      if (key === "GA4_PROPERTY_ID") return "525401563";
      return undefined;
    });
    vi.stubGlobal("Netlify", { env: { get: envGet } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns 503 when GA4 configuration is missing", async () => {
    envGet.mockReturnValue(undefined);
    const res = await handler(makeNetlifyRequest(API_ANALYTICS_DASHBOARD));
    expect(res.status).toBe(503);
    const body = await readJson<{ error: string; hint?: string }>(res);
    expect(body.error).toBe("Missing configuration");
    expect(mockFetchDashboardData).not.toHaveBeenCalled();
  });

  it("returns 500 when service account JSON is not valid base64 JSON", async () => {
    envGet.mockImplementation((key: string) => {
      if (key === "GA4_SERVICE_ACCOUNT_JSON") return "not-valid-json!!!";
      if (key === "GA4_PROPERTY_ID") return "525401563";
      return undefined;
    });

    const res = await handler(makeNetlifyRequest(API_ANALYTICS_DASHBOARD));
    expect(res.status).toBe(500);
    const body = await readJson<{ error: string }>(res);
    expect(body.error).toContain("Invalid GA4_SERVICE_ACCOUNT_JSON");
  });

  it("returns dashboard data with date buckets on successful fetch", async () => {
    const res = await handler(makeNetlifyRequest(API_ANALYTICS_DASHBOARD));
    expect(res.status).toBe(200);

    const body = await readJson<DashboardData & { filterMode: string }>(res);
    expect(body.filterMode).toBe("production");
    expect(body.dailyUsers).toHaveLength(2);
    expect(body.dailyUsers[0].date).toBe("20260501");
    expect(body.overview.activeUsers).toBe(15);
    assertResponseHasNoSecrets(JSON.stringify(body), [FAKE_PRIVATE_KEY, "ya29.mock-token"]);
    expect(mockFetchDashboardData).toHaveBeenCalledWith(
      "525401563",
      "ya29.mock-token",
      "production",
    );
  });

  it("handles empty dailyUsers from upstream without throwing", async () => {
    mockFetchDashboardData.mockResolvedValue(EMPTY_DASHBOARD);
    const res = await handler(makeNetlifyRequest(API_ANALYTICS_DASHBOARD));
    expect(res.status).toBe(200);
    const body = await readJson<DashboardData>(res);
    expect(body.dailyUsers).toEqual([]);
    expect(body.overview.activeUsers).toBe(0);
  });

  it("serves valid blob cache without calling GA4", async () => {
    const cachedPayload = {
      data: BUCKETED_DASHBOARD,
      expiresAt: Date.now() + 60_000,
    };
    mockGet.mockResolvedValue(JSON.stringify(cachedPayload));

    const res = await handler(makeNetlifyRequest(API_ANALYTICS_DASHBOARD));
    expect(res.status).toBe(200);
    const body = await readJson<DashboardData & { fromCache: boolean }>(res);
    expect(body.fromCache).toBe(true);
    expect(body.dailyUsers).toHaveLength(2);
    expect(mockGetAccessToken).not.toHaveBeenCalled();
    expect(mockFetchDashboardData).not.toHaveBeenCalled();
  });

  it("returns 502 when GA4 fetch fails", async () => {
    mockFetchDashboardData.mockRejectedValue(new Error("GA4 API unavailable"));
    const res = await handler(makeNetlifyRequest(API_ANALYTICS_DASHBOARD));
    expect(res.status).toBe(502);
    const body = await readJson<{ error: string }>(res);
    expect(body.error).toBe("Failed to fetch analytics data");
    assertResponseHasNoSecrets(JSON.stringify(body), [FAKE_PRIVATE_KEY]);
  });
});
