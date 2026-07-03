import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isoWeek,
  lastNWeeks,
  weeksSinceProjectStart,
  daysSinceProjectStart,
  isAIContribution,
  AI_LABEL,
  MAX_WEEKS_OF_HISTORY,
  PROJECT_START_DATE,
} from "../helpers";

describe("isoWeek", () => {
  it("returns correct ISO week for a known date", () => {
    // 2026-01-05 is a Monday in W02
    expect(isoWeek(new Date("2026-01-05"))).toBe("2026-W02");
  });

  it("returns W01 for first days of January that fall in week 1", () => {
    // 2026-01-01 is a Thursday — still W01
    expect(isoWeek(new Date("2026-01-01"))).toBe("2026-W01");
  });

  it("handles year boundary — late December may be W01 of next year", () => {
    // 2025-12-29 is a Monday — ISO week 01 of 2026
    expect(isoWeek(new Date("2025-12-29"))).toBe("2026-W01");
  });

  it("returns W52 or W53 for late December dates in their own year", () => {
    // 2025-12-22 is a Monday — W52 of 2025
    expect(isoWeek(new Date("2025-12-22"))).toBe("2025-W52");
  });

  it("handles mid-year date correctly", () => {
    // 2026-07-01 is a Wednesday
    const result = isoWeek(new Date("2026-07-01"));
    expect(result).toMatch(/^2026-W2[67]$/);
  });

  it("pads single-digit week numbers with zero", () => {
    // 2026-01-02 is a Friday — W01
    const result = isoWeek(new Date("2026-01-02"));
    expect(result).toMatch(/^2026-W0\d$/);
  });
});

describe("lastNWeeks", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns array of length n (or less if deduplication occurs)", () => {
    vi.setSystemTime(new Date("2026-03-15"));
    const weeks = lastNWeeks(4);
    expect(weeks.length).toBeGreaterThanOrEqual(1);
    expect(weeks.length).toBeLessThanOrEqual(4);
  });

  it("returns weeks in chronological order (oldest first)", () => {
    vi.setSystemTime(new Date("2026-06-01"));
    const weeks = lastNWeeks(5);
    for (let i = 1; i < weeks.length; i++) {
      expect(weeks[i] >= weeks[i - 1]).toBe(true);
    }
  });

  it("last element is the current week", () => {
    vi.setSystemTime(new Date("2026-06-15"));
    const weeks = lastNWeeks(3);
    const currentWeek = isoWeek(new Date("2026-06-15"));
    expect(weeks[weeks.length - 1]).toBe(currentWeek);
  });

  it("returns single element for n=1", () => {
    vi.setSystemTime(new Date("2026-04-10"));
    const weeks = lastNWeeks(1);
    expect(weeks).toHaveLength(1);
  });

  it("deduplicates weeks within same ISO week", () => {
    vi.setSystemTime(new Date("2026-01-07")); // Wednesday W02
    const weeks = lastNWeeks(3);
    const unique = new Set(weeks);
    expect(unique.size).toBe(weeks.length);
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
    vi.setSystemTime(new Date(PROJECT_START_DATE));
    expect(weeksSinceProjectStart()).toBeGreaterThanOrEqual(1);
  });

  it("is capped at MAX_WEEKS_OF_HISTORY", () => {
    // Set time far in the future
    vi.setSystemTime(new Date("2036-01-01"));
    expect(weeksSinceProjectStart()).toBeLessThanOrEqual(MAX_WEEKS_OF_HISTORY);
  });

  it("increases over time", () => {
    vi.setSystemTime(new Date("2026-02-16"));
    const early = weeksSinceProjectStart();
    vi.setSystemTime(new Date("2026-06-16"));
    const later = weeksSinceProjectStart();
    expect(later).toBeGreaterThan(early);
  });
});

describe("daysSinceProjectStart", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns at least 1", () => {
    vi.setSystemTime(new Date(PROJECT_START_DATE));
    expect(daysSinceProjectStart()).toBeGreaterThanOrEqual(1);
  });

  it("returns correct number of days", () => {
    // 10 days after project start
    vi.setSystemTime(new Date("2026-01-26"));
    expect(daysSinceProjectStart()).toBe(10);
  });

  it("increases day by day", () => {
    vi.setSystemTime(new Date("2026-03-01"));
    const d1 = daysSinceProjectStart();
    vi.setSystemTime(new Date("2026-03-02"));
    const d2 = daysSinceProjectStart();
    expect(d2 - d1).toBe(1);
  });
});

describe("isAIContribution", () => {
  it("returns true for known AI author", () => {
    expect(isAIContribution([], "clubanderson")).toBe(true);
    expect(isAIContribution([], "Copilot")).toBe(true);
    expect(isAIContribution([], "copilot-swe-agent[bot]")).toBe(true);
  });

  it("returns true for any [bot] author suffix", () => {
    expect(isAIContribution([], "dependabot[bot]")).toBe(true);
    expect(isAIContribution([], "github-actions[bot]")).toBe(true);
  });

  it("returns true when AI_LABEL is present in labels", () => {
    const labels = [{ name: "bug" }, { name: AI_LABEL }];
    expect(isAIContribution(labels, "random-user")).toBe(true);
  });

  it("returns false for human contributor without AI labels", () => {
    const labels = [{ name: "enhancement" }];
    expect(isAIContribution(labels, "human-dev")).toBe(false);
  });

  it("returns false for empty labels and non-AI author", () => {
    expect(isAIContribution([], "human-dev")).toBe(false);
  });

  it("handles null/undefined labels array gracefully", () => {
    // The implementation guards with (labels || [])
    expect(isAIContribution(null as unknown as { name: string }[], "human-dev")).toBe(false);
  });
});
