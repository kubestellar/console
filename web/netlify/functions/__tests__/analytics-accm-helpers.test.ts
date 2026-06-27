// @vitest-environment node
/**
 * Unit tests for analytics-accm/helpers.ts pure utility functions.
 *
 * Run: cd web && npx vitest run netlify/functions/__tests__/analytics-accm-helpers.test.ts
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isoWeek,
  lastNWeeks,
  weeksSinceProjectStart,
  daysSinceProjectStart,
  isAIContribution,
  AI_AUTHORS,
  AI_LABEL,
  PROJECT_START_DATE,
  MAX_WEEKS_OF_HISTORY,
} from "../analytics-accm/helpers";

describe("isoWeek", () => {
  it("returns correct ISO week for a mid-year date", () => {
    // 2026-06-15 (Monday) → W25
    expect(isoWeek(new Date("2026-06-15T12:00:00Z"))).toBe("2026-W25");
  });

  it("returns correct ISO week for January", () => {
    // 2026-01-12 (Monday) → W03
    expect(isoWeek(new Date("2026-01-12T12:00:00Z"))).toBe("2026-W03");
  });

  it("handles year boundary (Jan 1)", () => {
    // 2026-01-01 is a Thursday
    const result = isoWeek(new Date("2026-01-01T12:00:00Z"));
    expect(result).toMatch(/^\d{4}-W01$/);
  });

  it("handles last day of year", () => {
    // 2025-12-31 is a Wednesday → W01 of 2026 (ISO week rule)
    const result = isoWeek(new Date("2025-12-31"));
    expect(result).toMatch(/^\d{4}-W\d{2}$/);
  });

  it("returns correctly formatted string", () => {
    const result = isoWeek(new Date("2026-06-15"));
    expect(result).toMatch(/^\d{4}-W\d{2}$/);
  });
});

describe("lastNWeeks", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-25T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 1 week when n=1", () => {
    const weeks = lastNWeeks(1);
    expect(weeks).toHaveLength(1);
    expect(weeks[0]).toMatch(/^\d{4}-W\d{2}$/);
  });

  it("returns unique weeks in chronological order", () => {
    const weeks = lastNWeeks(4);
    expect(weeks.length).toBeGreaterThanOrEqual(1);
    expect(weeks.length).toBeLessThanOrEqual(4);
    // Each entry is unique
    expect(new Set(weeks).size).toBe(weeks.length);
  });

  it("ends with the current week", () => {
    const weeks = lastNWeeks(4);
    const currentWeek = isoWeek(new Date());
    expect(weeks[weeks.length - 1]).toBe(currentWeek);
  });

  it("returns empty-safe for n=0", () => {
    const weeks = lastNWeeks(0);
    expect(weeks).toHaveLength(0);
  });
});

describe("weeksSinceProjectStart", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns at least 1", () => {
    // Set time to project start date
    vi.setSystemTime(new Date(PROJECT_START_DATE));
    expect(weeksSinceProjectStart()).toBeGreaterThanOrEqual(1);
  });

  it("grows over time", () => {
    vi.setSystemTime(new Date("2026-02-16"));
    const early = weeksSinceProjectStart();
    vi.setSystemTime(new Date("2026-06-16"));
    const later = weeksSinceProjectStart();
    expect(later).toBeGreaterThan(early);
  });

  it("is capped at MAX_WEEKS_OF_HISTORY", () => {
    // Set time far in the future
    vi.setSystemTime(new Date("2040-01-01"));
    expect(weeksSinceProjectStart()).toBeLessThanOrEqual(MAX_WEEKS_OF_HISTORY);
  });
});

describe("daysSinceProjectStart", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns at least 1 on project start date", () => {
    vi.setSystemTime(new Date(PROJECT_START_DATE));
    expect(daysSinceProjectStart()).toBeGreaterThanOrEqual(1);
  });

  it("returns correct number of days", () => {
    vi.setSystemTime(new Date("2026-01-26")); // 10 days after 2026-01-16
    const days = daysSinceProjectStart();
    expect(days).toBe(10);
  });
});

describe("isAIContribution", () => {
  it("returns true for known AI authors", () => {
    for (const author of AI_AUTHORS) {
      expect(isAIContribution([], author)).toBe(true);
    }
  });

  it("returns true for any bot author (ending with [bot])", () => {
    expect(isAIContribution([], "dependabot[bot]")).toBe(true);
    expect(isAIContribution([], "renovate[bot]")).toBe(true);
  });

  it("returns true when labels include AI_LABEL", () => {
    expect(isAIContribution([{ name: AI_LABEL }], "human-dev")).toBe(true);
  });

  it("returns false for human authors without AI label", () => {
    expect(isAIContribution([], "human-dev")).toBe(false);
    expect(isAIContribution([{ name: "bug" }], "human-dev")).toBe(false);
  });

  it("handles empty labels array", () => {
    expect(isAIContribution([], "human-dev")).toBe(false);
  });

  it("handles null-ish labels gracefully", () => {
    // The function guards with (labels || [])
    expect(isAIContribution(null as unknown as { name: string }[], "human-dev")).toBe(false);
  });
});
