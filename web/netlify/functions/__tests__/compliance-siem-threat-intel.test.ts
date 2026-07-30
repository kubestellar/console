// @vitest-environment node
/**
 * Unit tests for compliance SIEM and Threat Intelligence Netlify functions.
 *
 * Tests cover: SIEM alerts, SIEM events, SIEM summary, Threat Intel feeds,
 * Threat Intel IOCs, and Threat Intel summary.
 */
import { describe, expect, it } from "vitest";

import siemAlerts from "../compliance-siem-alerts.mts";
import siemEvents from "../compliance-siem-events.mts";
import siemSummary from "../compliance-siem-summary.mts";
import threatFeeds from "../compliance-threat-intel-feeds.mts";
import threatIocs from "../compliance-threat-intel-iocs.mts";
import threatSummary from "../compliance-threat-intel-summary.mts";

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

// ── SIEM Alerts ──────────────────────────────────────────────────────────────

describe("compliance-siem-alerts", () => {
  it("returns 200 for GET", async () => {
    const res = await siemAlerts(makeRequest("GET"));
    expect(res.status).toBe(200);
  });

  it("returns an array of alerts", async () => {
    const res = await siemAlerts(makeRequest("GET"));
    const data = await parseJson(res) as Array<unknown>;
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
  });

  it("each alert has required fields", async () => {
    const res = await siemAlerts(makeRequest("GET"));
    const data = await parseJson(res) as Array<Record<string, unknown>>;
    for (const alert of data) {
      expect(alert).toHaveProperty("id");
      expect(alert).toHaveProperty("name");
      expect(alert).toHaveProperty("severity");
      expect(alert).toHaveProperty("status");
      expect(alert).toHaveProperty("source");
      expect(alert).toHaveProperty("triggered_at");
      expect(alert).toHaveProperty("correlated_events");
    }
  });

  it("severity is a valid SIEM level", async () => {
    const res = await siemAlerts(makeRequest("GET"));
    const data = await parseJson(res) as Array<{ severity: string }>;
    const validSeverities = ["critical", "high", "medium", "low", "info"];
    for (const alert of data) {
      expect(validSeverities).toContain(alert.severity);
    }
  });

  it("returns 405 for POST", async () => {
    const res = await siemAlerts(makeRequest("POST"));
    expect(res.status).toBe(405);
  });
});

// ── SIEM Events ──────────────────────────────────────────────────────────────

describe("compliance-siem-events", () => {
  it("returns 200 for GET", async () => {
    const res = await siemEvents(makeRequest("GET"));
    expect(res.status).toBe(200);
  });

  it("returns an array of events", async () => {
    const res = await siemEvents(makeRequest("GET"));
    const data = await parseJson(res) as Array<unknown>;
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
  });

  it("each event has required fields", async () => {
    const res = await siemEvents(makeRequest("GET"));
    const data = await parseJson(res) as Array<Record<string, unknown>>;
    for (const evt of data) {
      expect(evt).toHaveProperty("id");
      expect(evt).toHaveProperty("timestamp");
      expect(evt).toHaveProperty("source");
      expect(evt).toHaveProperty("severity");
      expect(evt).toHaveProperty("category");
      expect(evt).toHaveProperty("message");
      expect(evt).toHaveProperty("cluster");
    }
  });

  it("events cover multiple categories", async () => {
    const res = await siemEvents(makeRequest("GET"));
    const data = await parseJson(res) as Array<{ category: string }>;
    const categories = new Set(data.map(e => e.category));
    expect(categories.size).toBeGreaterThan(2);
  });

  it("returns 405 for PUT", async () => {
    const res = await siemEvents(makeRequest("PUT"));
    expect(res.status).toBe(405);
  });
});

// ── SIEM Summary ─────────────────────────────────────────────────────────────

describe("compliance-siem-summary", () => {
  it("returns 200 for GET", async () => {
    const res = await siemSummary(makeRequest("GET"));
    expect(res.status).toBe(200);
  });

  it("returns summary with required fields", async () => {
    const res = await siemSummary(makeRequest("GET"));
    const data = await parseJson(res) as Record<string, unknown>;
    expect(data).toHaveProperty("total_events");
    expect(data).toHaveProperty("events_last_24h");
    expect(data).toHaveProperty("total_alerts");
    expect(data).toHaveProperty("active_alerts");
    expect(data).toHaveProperty("critical_alerts");
    expect(data).toHaveProperty("top_sources");
    expect(data).toHaveProperty("ingestion_rate");
  });

  it("alert counts are consistent", async () => {
    const res = await siemSummary(makeRequest("GET"));
    const data = await parseJson(res) as {
      total_alerts: number;
      critical_alerts: number;
      high_alerts: number;
      medium_alerts: number;
      low_alerts: number;
    };
    const sum = data.critical_alerts + data.high_alerts + data.medium_alerts + data.low_alerts;
    expect(sum).toBe(data.total_alerts);
  });

  it("top_sources is a non-empty array", async () => {
    const res = await siemSummary(makeRequest("GET"));
    const data = await parseJson(res) as { top_sources: Array<{ source: string; count: number }> };
    expect(Array.isArray(data.top_sources)).toBe(true);
    expect(data.top_sources.length).toBeGreaterThan(0);
    for (const src of data.top_sources) {
      expect(src).toHaveProperty("source");
      expect(src).toHaveProperty("count");
      expect(typeof src.count).toBe("number");
    }
  });

  it("returns 405 for DELETE", async () => {
    const res = await siemSummary(makeRequest("DELETE"));
    expect(res.status).toBe(405);
  });
});

// ── Threat Intel Feeds ───────────────────────────────────────────────────────

describe("compliance-threat-intel-feeds", () => {
  it("returns 200 for GET", async () => {
    const res = await threatFeeds(makeRequest("GET"));
    expect(res.status).toBe(200);
  });

  it("returns an array of feeds", async () => {
    const res = await threatFeeds(makeRequest("GET"));
    const data = await parseJson(res) as Array<unknown>;
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
  });

  it("each feed has required fields", async () => {
    const res = await threatFeeds(makeRequest("GET"));
    const data = await parseJson(res) as Array<Record<string, unknown>>;
    for (const feed of data) {
      expect(feed).toHaveProperty("id");
      expect(feed).toHaveProperty("name");
      expect(feed).toHaveProperty("provider");
      expect(feed).toHaveProperty("status");
      expect(feed).toHaveProperty("last_updated");
      expect(feed).toHaveProperty("indicators_count");
      expect(feed).toHaveProperty("category");
    }
  });

  it("status is active or stale", async () => {
    const res = await threatFeeds(makeRequest("GET"));
    const data = await parseJson(res) as Array<{ status: string }>;
    for (const feed of data) {
      expect(["active", "stale", "disabled"]).toContain(feed.status);
    }
  });

  it("returns 405 for POST", async () => {
    const res = await threatFeeds(makeRequest("POST"));
    expect(res.status).toBe(405);
  });
});

// ── Threat Intel IOCs ────────────────────────────────────────────────────────

describe("compliance-threat-intel-iocs", () => {
  it("returns 200 for GET", async () => {
    const res = await threatIocs(makeRequest("GET"));
    expect(res.status).toBe(200);
  });

  it("returns an array of IOC matches", async () => {
    const res = await threatIocs(makeRequest("GET"));
    const data = await parseJson(res) as Array<unknown>;
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
  });

  it("each IOC has required fields", async () => {
    const res = await threatIocs(makeRequest("GET"));
    const data = await parseJson(res) as Array<Record<string, unknown>>;
    for (const ioc of data) {
      expect(ioc).toHaveProperty("id");
      expect(ioc).toHaveProperty("ioc_type");
      expect(ioc).toHaveProperty("indicator");
      expect(ioc).toHaveProperty("feed_name");
      expect(ioc).toHaveProperty("severity");
      expect(ioc).toHaveProperty("matched_resource");
      expect(ioc).toHaveProperty("cluster");
      expect(ioc).toHaveProperty("detected_at");
      expect(ioc).toHaveProperty("status");
    }
  });

  it("ioc_type is a valid indicator type", async () => {
    const res = await threatIocs(makeRequest("GET"));
    const data = await parseJson(res) as Array<{ ioc_type: string }>;
    const validTypes = ["ip", "domain", "hash", "url", "email"];
    for (const ioc of data) {
      expect(validTypes).toContain(ioc.ioc_type);
    }
  });

  it("IOC status is a valid value", async () => {
    const res = await threatIocs(makeRequest("GET"));
    const data = await parseJson(res) as Array<{ status: string }>;
    const validStatuses = ["active", "mitigated", "false_positive", "resolved"];
    for (const ioc of data) {
      expect(validStatuses).toContain(ioc.status);
    }
  });

  it("returns 405 for PATCH", async () => {
    const res = await threatIocs(makeRequest("PATCH"));
    expect(res.status).toBe(405);
  });
});

// ── Threat Intel Summary ─────────────────────────────────────────────────────

describe("compliance-threat-intel-summary", () => {
  it("returns 200 for GET", async () => {
    const res = await threatSummary(makeRequest("GET"));
    expect(res.status).toBe(200);
  });

  it("returns summary with required fields", async () => {
    const res = await threatSummary(makeRequest("GET"));
    const data = await parseJson(res) as Record<string, unknown>;
    expect(data).toHaveProperty("total_feeds");
    expect(data).toHaveProperty("active_feeds");
    expect(data).toHaveProperty("total_indicators");
    expect(data).toHaveProperty("total_matches");
    expect(data).toHaveProperty("active_matches");
    expect(data).toHaveProperty("risk_score");
    expect(data).toHaveProperty("top_ioc_types");
  });

  it("match severity counts are present", async () => {
    const res = await threatSummary(makeRequest("GET"));
    const data = await parseJson(res) as Record<string, unknown>;
    expect(data).toHaveProperty("critical_matches");
    expect(data).toHaveProperty("high_matches");
    expect(data).toHaveProperty("medium_matches");
    expect(data).toHaveProperty("low_matches");
  });

  it("match counts sum to total_matches", async () => {
    const res = await threatSummary(makeRequest("GET"));
    const data = await parseJson(res) as {
      total_matches: number;
      critical_matches: number;
      high_matches: number;
      medium_matches: number;
      low_matches: number;
    };
    const sum = data.critical_matches + data.high_matches + data.medium_matches + data.low_matches;
    expect(sum).toBe(data.total_matches);
  });

  it("top_ioc_types is a non-empty array with type and count", async () => {
    const res = await threatSummary(makeRequest("GET"));
    const data = await parseJson(res) as { top_ioc_types: Array<{ type: string; count: number }> };
    expect(Array.isArray(data.top_ioc_types)).toBe(true);
    expect(data.top_ioc_types.length).toBeGreaterThan(0);
    for (const entry of data.top_ioc_types) {
      expect(entry).toHaveProperty("type");
      expect(entry).toHaveProperty("count");
    }
  });

  it("returns 405 for POST", async () => {
    const res = await threatSummary(makeRequest("POST"));
    expect(res.status).toBe(405);
  });
});
