import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GA4Row } from "../analytics-dashboard-types";
import { fetchDashboardData } from "../analytics-dashboard";

const PROPERTY_ID = "property-123";
const ACCESS_TOKEN = "token-abc";
const FIXED_NOW = new Date("2026-03-04T05:06:07.000Z");
const REPORT_COUNT = 20;
const GA4_API_PREFIX = "https://analyticsdata.googleapis.com/v1beta/properties/";

function makeRow(dimensions: string[], metrics: Array<string | number>): GA4Row {
  return {
    dimensionValues: dimensions.map((value) => ({ value })),
    metricValues: metrics.map((value) => ({ value: String(value) })),
  };
}

function jsonResponse(rows: GA4Row[], status = 200): Response {
  return new Response(JSON.stringify({ rows }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function buildRows(): GA4Row[][] {
  return [
    [makeRow([], [100, 50, 200, 300, 0.5, 250])],
    [makeRow([], [80, 40, 150, 200, 0.4, 160])],
    [makeRow(["20260101"], [30, 33]), makeRow(["20260102"], [20, 25])],
    [makeRow(["Dashboard"], [90, 120])],
    [makeRow(["login"], [7, 5]), makeRow(["ksc_theme_changed"], [3, 2])],
    [makeRow(["United States"], [40, 45])],
    [makeRow(["github"], [15, 11])],
    [makeRow(["desktop"], [38])],
    [
      makeRow(["page_view"], [20]),
      makeRow(["login"], [14]),
      makeRow(["ksc_install_command_copied"], [9]),
      makeRow(["ksc_agent_connected"], [8]),
      makeRow(["ksc_fixer_viewed"], [5]),
      makeRow(["ksc_mission_started"], [3]),
    ],
    [makeRow(["open-cluster-management"], [6, 5, 4]), makeRow(["(not set)"], [1, 1, 1])],
    [makeRow(["Dashboard"], [100, 0.2, 20, 4])],
    [makeRow(["new"], [11, 12]), makeRow(["returning"], [7, 8])],
    [
      makeRow(["ksc_mission_started"], [5, 4]),
      makeRow(["ksc_mission_completed"], [3, 3]),
      makeRow(["ksc_mission_error"], [1, 1]),
      makeRow(["ksc_mission_rated"], [2, 2]),
    ],
    [makeRow(["agentic"], [5]), makeRow(["(not set)"], [2])],
    [
      makeRow(["overview", "ksc_card_added"], [4]),
      makeRow(["overview", "ksc_card_expanded"], [1]),
      makeRow(["actions", "ksc_card_list_item_clicked"], [7]),
    ],
    [makeRow(["ksc_global_search_opened"], [8, 6]), makeRow(["(not set)"], [1, 1])],
    [makeRow(["2026W01", "new"], [6]), makeRow(["2026W01", "returning"], [4])],
    [
      makeRow(["ksc_error", "(not set)"], [4]),
      makeRow(["ksc_mission_error", "timeout"], [2]),
      makeRow(["ksc_mission_error", "timeout"], [1]),
    ],
    [
      makeRow(["20260101", "ksc_error", "(not set)"], [1]),
      makeRow(["20260102", "ksc_error", "(not set)"], [3]),
      makeRow(["20260101", "ksc_mission_error", "timeout"], [2]),
      makeRow(["20260102", "ksc_mission_error", "timeout"], [1]),
    ],
    [makeRow(["20260101"], [2]), makeRow(["20260102"], [5])],
  ];
}

describe("analytics-dashboard shared module", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("aggregates GA4 report responses into dashboard data and applies production filters", async () => {
    const fetchMock = vi.fn();
    for (const rows of buildRows()) {
      fetchMock.mockResolvedValueOnce(jsonResponse(rows));
    }
    vi.stubGlobal("fetch", fetchMock);

    const dashboard = await fetchDashboardData(PROPERTY_ID, ACCESS_TOKEN, "production");

    expect(fetchMock).toHaveBeenCalledTimes(REPORT_COUNT);
    expect(dashboard.overview).toEqual({
      activeUsers: 100,
      sessions: 50,
      pageViews: 200,
      avgEngagementTime: 300,
      bounceRate: 0.5,
      eventsPerSession: 5,
    });
    expect(dashboard.overviewPrevious.eventsPerSession).toBe(4);
    expect(dashboard.dailyUsers).toEqual([
      { date: "20260101", users: 30, sessions: 33 },
      { date: "20260102", users: 20, sessions: 25 },
    ]);
    expect(dashboard.funnel).toEqual({
      landing: 20,
      login: 14,
      commandCopied: 9,
      agentConnected: 8,
      fixerViewed: 5,
      missionStarted: 3,
    });
    expect(dashboard.cncfOutreach).toEqual([
      { project: "open-cluster-management", sessions: 6, users: 5, events: 4 },
    ]);
    expect(dashboard.engagementByPage).toEqual([
      { page: "Dashboard", avgEngagement: 25, bounceRate: 0.2, views: 20 },
    ]);
    expect(dashboard.missions).toEqual({
      started: 5,
      completed: 3,
      errored: 1,
      rated: 2,
      topTypes: [{ type: "agentic", count: 5 }],
    });
    expect(dashboard.cardPopularity).toEqual([
      { card: "actions", added: 0, expanded: 0, clicked: 7 },
      { card: "overview", added: 4, expanded: 1, clicked: 0 },
    ]);
    expect(dashboard.featureAdoption).toEqual([
      { feature: "global search opened", count: 8, users: 6 },
    ]);
    expect(dashboard.weeklyRetention).toEqual([
      { week: "2026W01", newUsers: 6, returning: 4 },
    ]);
    expect(dashboard.errors).toEqual([
      { event: "error", count: 4, detail: "—", daily: [1, 3] },
      { event: "mission error", count: 3, detail: "timeout", daily: [2, 1] },
    ]);
    expect(dashboard.dailyFunnel).toEqual([
      { date: "20260101", agentConnected: 2 },
      { date: "20260102", agentConnected: 5 },
    ]);
    expect(dashboard.cachedAt).toBe(FIXED_NOW.toISOString());
    expect(dashboard.propertyId).toBe(PROPERTY_ID);
    expect(dashboard.dateRange).toBe("Last 28 days");

    const firstRequest = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(firstRequest.dimensionFilter).toEqual({
      notExpression: {
        filter: {
          fieldName: "customUser:deployment_type",
          stringFilter: { matchType: "EXACT", value: "localhost" },
        },
      },
    });

    const filteredRequest = JSON.parse(String(fetchMock.mock.calls[8]?.[1]?.body));
    expect(filteredRequest.dimensionFilter.andGroup.expressions).toHaveLength(2);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(`${GA4_API_PREFIX}${PROPERTY_ID}:runReport`);
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toEqual({
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    });
  });

  it("leaves report filters untouched when filter mode is all", async () => {
    const fetchMock = vi.fn();
    for (let index = 0; index < REPORT_COUNT; index += 1) {
      fetchMock.mockResolvedValueOnce(jsonResponse([]));
    }
    vi.stubGlobal("fetch", fetchMock);

    const dashboard = await fetchDashboardData(PROPERTY_ID, ACCESS_TOKEN, "all");

    expect(dashboard.topPages).toEqual([]);
    const firstRequest = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(firstRequest.dimensionFilter).toBeUndefined();

    const funnelRequest = JSON.parse(String(fetchMock.mock.calls[8]?.[1]?.body));
    expect(funnelRequest.dimensionFilter.andGroup).toBeUndefined();
    expect(funnelRequest.dimensionFilter.orGroup.expressions).toHaveLength(8);
  });

  it("sanitizes upstream API errors before throwing", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const errorBody = `${"bad\n".repeat(200)}done`;
    const fetchMock = vi.fn().mockResolvedValue(new Response(errorBody, {
      status: 502,
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchDashboardData(PROPERTY_ID, ACCESS_TOKEN, "production")).rejects.toThrow(
      /Upstream service error \(req=\d+\)/,
    );

    const loggedMessage = String(errorSpy.mock.calls[0]?.[0] ?? "");
    expect(loggedMessage).toContain("GA4 API error");
    expect(loggedMessage).not.toContain("\n");
    expect(loggedMessage).toContain("…[truncated]");
  });
});
