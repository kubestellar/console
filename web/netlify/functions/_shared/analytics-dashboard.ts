import type { DashboardData, FilterMode, GA4Row } from "./analytics-dashboard-types";

export const CACHE_STORE = "analytics-dashboard";
export const CACHE_KEY_PREFIX = "dashboard-data";
export const CACHE_TTL_MS = 15 * 60 * 1000;

const GA4_DATA_API = "https://analyticsdata.googleapis.com/v1beta";
const CURRENT_RANGE = { startDate: "28daysAgo", endDate: "today" };
const PREVIOUS_RANGE = { startDate: "56daysAgo", endDate: "29daysAgo" };
const NOT_SET = "(not set)";
const DATA_DELETED = "(data deleted)";
const DETAIL_PLACEHOLDER = "—";
const KSC_PREFIX = "ksc_";
const ERROR_KEY_SEPARATOR = "|||";
const LOCALHOST_EXCLUSION = {
  notExpression: {
    filter: {
      fieldName: "customUser:deployment_type",
      stringFilter: { matchType: "EXACT" as const, value: "localhost" },
    },
  },
};

function sanitizeUpstreamError(text: string): string {
  const oneLine = text.replace(/[\r\n]+/g, " ").trim();
  return oneLine.length > 500 ? oneLine.slice(0, 500) + "…[truncated]" : oneLine;
}

function dimVal(row: GA4Row, idx: number): string {
  return (row.dimensionValues || [])[idx]?.value || NOT_SET;
}

function metVal(row: GA4Row, idx: number): number {
  return parseFloat((row.metricValues || [])[idx]?.value || "0");
}

function withFilter(
  body: Record<string, unknown>,
  mode: FilterMode
): Record<string, unknown> {
  if (mode === "all") return body;
  const existing = body.dimensionFilter as Record<string, unknown> | undefined;
  if (!existing) {
    return { ...body, dimensionFilter: LOCALHOST_EXCLUSION };
  }
  return {
    ...body,
    dimensionFilter: {
      andGroup: { expressions: [existing, LOCALHOST_EXCLUSION] },
    },
  };
}

async function runReport(
  propertyId: string,
  accessToken: string,
  body: Record<string, unknown>
): Promise<GA4Row[]> {
  const resp = await fetch(`${GA4_DATA_API}/properties/${propertyId}:runReport`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });

  if (!resp.ok) {
    const text = await resp.text();
    const reqId = Date.now();
    console.error(`[analytics-dashboard] GA4 API error (req=${reqId}): HTTP ${resp.status} — ${sanitizeUpstreamError(text)}`);
    throw new Error(`Upstream service error (req=${reqId})`);
  }

  const data = await resp.json();
  return data.rows || [];
}

function buildEventExpressions(events: readonly string[]) {
  return events.map((ev) => ({
    filter: {
      fieldName: "eventName",
      stringFilter: { matchType: "EXACT" as const, value: ev },
    },
  }));
}

function buildOverview(row: GA4Row | undefined) {
  return row
    ? {
        activeUsers: metVal(row, 0),
        sessions: metVal(row, 1),
        pageViews: metVal(row, 2),
        avgEngagementTime: metVal(row, 3),
        bounceRate: metVal(row, 4),
        eventsPerSession: metVal(row, 1) > 0 ? metVal(row, 5) / metVal(row, 1) : 0,
      }
    : {
        activeUsers: 0,
        sessions: 0,
        pageViews: 0,
        avgEngagementTime: 0,
        bounceRate: 0,
        eventsPerSession: 0,
      };
}

function buildCountMap(rows: GA4Row[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    counts[dimVal(row, 0)] = metVal(row, 0);
  }
  return counts;
}

function normalizeEventName(eventName: string): string {
  return eventName.replace(KSC_PREFIX, "").replace(/_/g, " ");
}

function normalizeDetail(detail: string): string {
  return !detail || detail === NOT_SET || detail === DATA_DELETED ? DETAIL_PLACEHOLDER : detail;
}

function buildMissionTopTypes(rows: GA4Row[]) {
  return rows
    .filter((row) => dimVal(row, 0) !== NOT_SET)
    .map((row) => ({ type: dimVal(row, 0), count: metVal(row, 0) }));
}

function buildCardPopularity(rows: GA4Row[]) {
  const cardMap = new Map<string, { added: number; expanded: number; clicked: number }>();
  for (const row of rows) {
    const card = dimVal(row, 0);
    const event = dimVal(row, 1);
    const count = metVal(row, 0);
    if (card === NOT_SET) continue;
    if (!cardMap.has(card)) {
      cardMap.set(card, { added: 0, expanded: 0, clicked: 0 });
    }
    const entry = cardMap.get(card)!;
    if (event === "ksc_card_added") entry.added += count;
    else if (event === "ksc_card_expanded") entry.expanded += count;
    else if (event === "ksc_card_list_item_clicked") entry.clicked += count;
  }

  return [...cardMap.entries()]
    .map(([card, stats]) => ({ card, ...stats }))
    .sort((a, b) => b.added + b.expanded + b.clicked - (a.added + a.expanded + a.clicked));
}

function buildFeatureAdoption(rows: GA4Row[]) {
  return rows
    .filter((row) => dimVal(row, 0) !== NOT_SET)
    .map((row) => ({
      feature: normalizeEventName(dimVal(row, 0)),
      count: metVal(row, 0),
      users: metVal(row, 1),
    }));
}

function buildWeeklyRetention(rows: GA4Row[]) {
  const weekMap = new Map<string, { newUsers: number; returning: number }>();
  for (const row of rows) {
    const week = dimVal(row, 0);
    const type = dimVal(row, 1);
    const users = metVal(row, 0);
    if (!weekMap.has(week)) {
      weekMap.set(week, { newUsers: 0, returning: 0 });
    }
    const entry = weekMap.get(week)!;
    if (type === "new") entry.newUsers = users;
    else if (type === "returning") entry.returning = users;
  }

  return [...weekMap.entries()]
    .map(([week, data]) => ({ week, ...data }))
    .sort((a, b) => a.week.localeCompare(b.week));
}

function buildErrors(errorRows: GA4Row[], errorDailyRows: GA4Row[], dailyRows: GA4Row[]) {
  const allDates = dailyRows.map((row) => dimVal(row, 0)).sort();
  const errorDailyMap = new Map<string, Map<string, number>>();

  for (const row of errorDailyRows) {
    const date = dimVal(row, 0);
    const event = normalizeEventName(dimVal(row, 1));
    const detail = normalizeDetail(dimVal(row, 2));
    const count = metVal(row, 0);
    const key = `${event}${ERROR_KEY_SEPARATOR}${detail}`;
    if (!errorDailyMap.has(key)) {
      errorDailyMap.set(key, new Map());
    }
    const dayMap = errorDailyMap.get(key)!;
    dayMap.set(date, (dayMap.get(date) || 0) + count);
  }

  const errorMerged = new Map<string, { event: string; count: number; detail: string }>();
  for (const row of errorRows) {
    if (dimVal(row, 0) === NOT_SET) continue;
    const event = normalizeEventName(dimVal(row, 0));
    const detail = normalizeDetail(dimVal(row, 1));
    const key = `${event}${ERROR_KEY_SEPARATOR}${detail}`;
    const existing = errorMerged.get(key);
    if (existing) {
      existing.count += metVal(row, 0);
    } else {
      errorMerged.set(key, { event, count: metVal(row, 0), detail });
    }
  }

  return [...errorMerged.values()]
    .sort((a, b) => b.count - a.count)
    .map((entry) => {
      const key = `${entry.event}${ERROR_KEY_SEPARATOR}${entry.detail}`;
      const dayMap = errorDailyMap.get(key);
      const daily = allDates.map((date) => dayMap?.get(date) || 0);
      return { event: entry.event, count: entry.count, detail: entry.detail, daily };
    });
}

export async function fetchDashboardData(
  propertyId: string,
  accessToken: string,
  filterMode: FilterMode = "production"
): Promise<DashboardData> {
  const [
    overviewRows,
    overviewPrevRows,
    dailyRows,
    pageRows,
    eventRows,
    countryRows,
    sourceRows,
    deviceRows,
    funnelRows,
    cncfRows,
    engagementRows,
    newReturnRows,
    missionEventRows,
    missionTypeRows,
    cardPopRows,
    featureRows,
    weeklyRetRows,
    errorRows,
    errorDailyRows,
    dailyFunnelRows,
  ] = await Promise.all([
    runReport(propertyId, accessToken, withFilter({
      dateRanges: [CURRENT_RANGE],
      metrics: [
        { name: "activeUsers" },
        { name: "sessions" },
        { name: "screenPageViews" },
        { name: "averageSessionDuration" },
        { name: "bounceRate" },
        { name: "eventCount" },
      ],
    }, filterMode)),
    runReport(propertyId, accessToken, withFilter({
      dateRanges: [PREVIOUS_RANGE],
      metrics: [
        { name: "activeUsers" },
        { name: "sessions" },
        { name: "screenPageViews" },
        { name: "averageSessionDuration" },
        { name: "bounceRate" },
        { name: "eventCount" },
      ],
    }, filterMode)),
    runReport(propertyId, accessToken, withFilter({
      dateRanges: [CURRENT_RANGE],
      dimensions: [{ name: "date" }],
      metrics: [{ name: "activeUsers" }, { name: "sessions" }],
      orderBys: [{ dimension: { dimensionName: "date", orderType: "ALPHANUMERIC" } }],
    }, filterMode)),
    runReport(propertyId, accessToken, withFilter({
      dateRanges: [CURRENT_RANGE],
      dimensions: [{ name: "pageTitle" }],
      metrics: [{ name: "screenPageViews" }, { name: "averageSessionDuration" }],
      orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
      limit: 15,
    }, filterMode)),
    runReport(propertyId, accessToken, withFilter({
      dateRanges: [CURRENT_RANGE],
      dimensions: [{ name: "eventName" }],
      metrics: [{ name: "eventCount" }, { name: "totalUsers" }],
      orderBys: [{ metric: { metricName: "eventCount" }, desc: true }],
      limit: 20,
    }, filterMode)),
    runReport(propertyId, accessToken, withFilter({
      dateRanges: [CURRENT_RANGE],
      dimensions: [{ name: "country" }],
      metrics: [{ name: "activeUsers" }, { name: "sessions" }],
      orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }],
      limit: 15,
    }, filterMode)),
    runReport(propertyId, accessToken, withFilter({
      dateRanges: [CURRENT_RANGE],
      dimensions: [{ name: "sessionSource" }, { name: "sessionMedium" }],
      metrics: [{ name: "sessions" }, { name: "totalUsers" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 10,
    }, filterMode)),
    runReport(propertyId, accessToken, withFilter({
      dateRanges: [CURRENT_RANGE],
      dimensions: [{ name: "deviceCategory" }],
      metrics: [{ name: "activeUsers" }],
      orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }],
    }, filterMode)),
    runReport(propertyId, accessToken, withFilter({
      dateRanges: [CURRENT_RANGE],
      dimensions: [{ name: "eventName" }],
      metrics: [{ name: "totalUsers" }],
      dimensionFilter: {
        orGroup: {
          expressions: buildEventExpressions([
            "ksc_utm_landing",
            "login",
            "ksc_install_command_copied",
            "ksc_agent_connected",
            "ksc_fixer_viewed",
            "ksc_mission_started",
            "page_view",
            "first_visit",
          ]),
        },
      },
    }, filterMode)),
    runReport(propertyId, accessToken, withFilter({
      dateRanges: [CURRENT_RANGE],
      dimensions: [{ name: "sessionManualTerm" }],
      metrics: [{ name: "sessions" }, { name: "totalUsers" }, { name: "eventCount" }],
      dimensionFilter: {
        filter: {
          fieldName: "sessionCampaignName",
          stringFilter: { matchType: "EXACT" as const, value: "cncf_outreach" },
        },
      },
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 30,
    }, filterMode)),
    runReport(propertyId, accessToken, withFilter({
      dateRanges: [CURRENT_RANGE],
      dimensions: [{ name: "pageTitle" }],
      metrics: [
        { name: "userEngagementDuration" },
        { name: "bounceRate" },
        { name: "screenPageViews" },
        { name: "activeUsers" },
      ],
      orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
      limit: 15,
    }, filterMode)),
    runReport(propertyId, accessToken, withFilter({
      dateRanges: [CURRENT_RANGE],
      dimensions: [{ name: "newVsReturning" }],
      metrics: [{ name: "activeUsers" }, { name: "sessions" }],
    }, filterMode)),
    runReport(propertyId, accessToken, withFilter({
      dateRanges: [CURRENT_RANGE],
      dimensions: [{ name: "eventName" }],
      metrics: [{ name: "eventCount" }, { name: "totalUsers" }],
      dimensionFilter: {
        orGroup: {
          expressions: buildEventExpressions([
            "ksc_mission_started",
            "ksc_mission_completed",
            "ksc_mission_error",
            "ksc_mission_rated",
          ]),
        },
      },
    }, filterMode)),
    runReport(propertyId, accessToken, withFilter({
      dateRanges: [CURRENT_RANGE],
      dimensions: [{ name: "customEvent:mission_type" }],
      metrics: [{ name: "eventCount" }],
      dimensionFilter: {
        filter: {
          fieldName: "eventName",
          stringFilter: { matchType: "EXACT" as const, value: "ksc_mission_started" },
        },
      },
      orderBys: [{ metric: { metricName: "eventCount" }, desc: true }],
      limit: 15,
    }, filterMode)),
    runReport(propertyId, accessToken, withFilter({
      dateRanges: [CURRENT_RANGE],
      dimensions: [{ name: "customEvent:card_type" }, { name: "eventName" }],
      metrics: [{ name: "eventCount" }],
      dimensionFilter: {
        orGroup: {
          expressions: buildEventExpressions([
            "ksc_card_added",
            "ksc_card_expanded",
            "ksc_card_list_item_clicked",
          ]),
        },
      },
      orderBys: [{ metric: { metricName: "eventCount" }, desc: true }],
      limit: 100,
    }, filterMode)),
    runReport(propertyId, accessToken, withFilter({
      dateRanges: [CURRENT_RANGE],
      dimensions: [{ name: "eventName" }],
      metrics: [{ name: "eventCount" }, { name: "totalUsers" }],
      dimensionFilter: {
        orGroup: {
          expressions: buildEventExpressions([
            "ksc_global_search_opened",
            "ksc_global_search_queried",
            "ksc_theme_changed",
            "ksc_language_changed",
            "ksc_demo_mode_toggled",
            "ksc_dashboard_created",
            "ksc_data_exported",
            "ksc_marketplace_install",
            "ksc_drill_down_opened",
            "ksc_card_refreshed",
            "ksc_tour_started",
            "ksc_tour_completed",
            "ksc_feedback_submitted",
            "ksc_linkedin_share",
            "ksc_pwa_prompt_shown",
            "ksc_sidebar_navigated",
            "ksc_add_card_modal_opened",
          ]),
        },
      },
      orderBys: [{ metric: { metricName: "eventCount" }, desc: true }],
      limit: 20,
    }, filterMode)),
    runReport(propertyId, accessToken, withFilter({
      dateRanges: [CURRENT_RANGE],
      dimensions: [{ name: "week" }, { name: "newVsReturning" }],
      metrics: [{ name: "activeUsers" }],
      orderBys: [{ dimension: { dimensionName: "week", orderType: "ALPHANUMERIC" } }],
    }, filterMode)),
    runReport(propertyId, accessToken, withFilter({
      dateRanges: [CURRENT_RANGE],
      dimensions: [{ name: "eventName" }, { name: "customEvent:error_category" }],
      metrics: [{ name: "eventCount" }],
      dimensionFilter: {
        orGroup: {
          expressions: buildEventExpressions([
            "ksc_error",
            "ksc_mission_error",
            "ksc_update_failed",
            "ksc_chunk_reload_recovery_failed",
            "ksc_marketplace_install_failed",
            "ksc_update_stalled",
          ]),
        },
      },
      orderBys: [{ metric: { metricName: "eventCount" }, desc: true }],
      limit: 30,
    }, filterMode)),
    runReport(propertyId, accessToken, withFilter({
      dateRanges: [CURRENT_RANGE],
      dimensions: [{ name: "date" }, { name: "eventName" }, { name: "customEvent:error_category" }],
      metrics: [{ name: "eventCount" }],
      dimensionFilter: {
        orGroup: {
          expressions: buildEventExpressions([
            "ksc_error",
            "ksc_mission_error",
            "ksc_update_failed",
            "ksc_chunk_reload_recovery_failed",
            "ksc_marketplace_install_failed",
            "ksc_update_stalled",
          ]),
        },
      },
      orderBys: [{ dimension: { dimensionName: "date", orderType: "ALPHANUMERIC" } }],
    }, filterMode)),
    runReport(propertyId, accessToken, withFilter({
      dateRanges: [CURRENT_RANGE],
      dimensions: [{ name: "date" }],
      metrics: [{ name: "totalUsers" }],
      dimensionFilter: {
        filter: {
          fieldName: "eventName",
          stringFilter: { matchType: "EXACT" as const, value: "ksc_agent_connected" },
        },
      },
      orderBys: [{ dimension: { dimensionName: "date", orderType: "ALPHANUMERIC" } }],
    }, filterMode)),
  ]);

  const overview = buildOverview(overviewRows[0]);
  const overviewPrevious = buildOverview(overviewPrevRows[0]);
  const funnelMap = buildCountMap(funnelRows);
  const missionMap = buildCountMap(missionEventRows);
  const missionTopTypes = buildMissionTopTypes(missionTypeRows);
  const cardPopularity = buildCardPopularity(cardPopRows);
  const featureAdoption = buildFeatureAdoption(featureRows);
  const weeklyRetention = buildWeeklyRetention(weeklyRetRows);
  const errors = buildErrors(errorRows, errorDailyRows, dailyRows);

  return {
    overview,
    overviewPrevious,
    dailyUsers: dailyRows.map((row) => ({
      date: dimVal(row, 0),
      users: metVal(row, 0),
      sessions: metVal(row, 1),
    })),
    topPages: pageRows.map((row) => ({
      page: dimVal(row, 0),
      views: metVal(row, 0),
      avgTime: metVal(row, 1),
    })),
    topEvents: eventRows.map((row) => ({
      event: dimVal(row, 0),
      count: metVal(row, 0),
      users: metVal(row, 1),
    })),
    countries: countryRows.map((row) => ({
      country: dimVal(row, 0),
      users: metVal(row, 0),
      sessions: metVal(row, 1),
    })),
    trafficSources: sourceRows.map((row) => ({
      source: dimVal(row, 0),
      medium: dimVal(row, 1),
      sessions: metVal(row, 0),
      users: metVal(row, 1),
    })),
    devices: deviceRows.map((row) => ({
      category: dimVal(row, 0),
      users: metVal(row, 0),
    })),
    funnel: {
      landing: funnelMap.page_view || funnelMap.first_visit || 0,
      login: funnelMap.login || 0,
      commandCopied: funnelMap.ksc_install_command_copied || 0,
      agentConnected: funnelMap.ksc_agent_connected || 0,
      fixerViewed: funnelMap.ksc_fixer_viewed || 0,
      missionStarted: funnelMap.ksc_mission_started || 0,
    },
    cncfOutreach: cncfRows
      .filter((row) => dimVal(row, 0) !== NOT_SET)
      .map((row) => ({
        project: dimVal(row, 0),
        sessions: metVal(row, 0),
        users: metVal(row, 1),
        events: metVal(row, 2),
      })),
    engagementByPage: engagementRows.map((row) => ({
      page: dimVal(row, 0),
      avgEngagement: metVal(row, 3) > 0 ? metVal(row, 0) / metVal(row, 3) : 0,
      bounceRate: metVal(row, 1),
      views: metVal(row, 2),
    })),
    newVsReturning: newReturnRows.map((row) => ({
      type: dimVal(row, 0),
      users: metVal(row, 0),
      sessions: metVal(row, 1),
    })),
    missions: {
      started: missionMap.ksc_mission_started || 0,
      completed: missionMap.ksc_mission_completed || 0,
      errored: missionMap.ksc_mission_error || 0,
      rated: missionMap.ksc_mission_rated || 0,
      topTypes: missionTopTypes,
    },
    cardPopularity,
    featureAdoption,
    weeklyRetention,
    errors,
    dailyFunnel: dailyFunnelRows.map((row) => ({
      date: dimVal(row, 0),
      agentConnected: metVal(row, 0),
    })),
    cachedAt: new Date().toISOString(),
    propertyId,
    dateRange: "Last 28 days",
  };
}
