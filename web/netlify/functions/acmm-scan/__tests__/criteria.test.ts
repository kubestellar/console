import { describe, expect, it } from "vitest";

import { CRITERIA } from "../criteria";

const VALID_DETECTION_TYPES = new Set(["path", "glob", "any-of"]);
const MIN_LEVEL = 0;
const MAX_LEVEL = 6;

describe("CRITERIA", () => {
  it("defines required fields for every criterion", () => {
    for (const criterion of CRITERIA) {
      expect(typeof criterion.id).toBe("string");
      expect(criterion.id.length).toBeGreaterThan(0);
      expect(typeof criterion.source).toBe("string");
      expect(criterion.source.length).toBeGreaterThan(0);
      expect(typeof criterion.category).toBe("string");
      expect(criterion.category.length).toBeGreaterThan(0);
      expect(typeof criterion.name).toBe("string");
      expect(criterion.name.length).toBeGreaterThan(0);
      expect(typeof criterion.detection).toBe("object");
      expect(criterion.detection).not.toBeNull();
    }
  });

  it("uses only supported detection types", () => {
    for (const criterion of CRITERIA) {
      expect(VALID_DETECTION_TYPES.has(criterion.detection.type)).toBe(true);
    }
  });

  it("defines a non-empty detection pattern for every criterion", () => {
    for (const criterion of CRITERIA) {
      const { pattern } = criterion.detection;

      if (Array.isArray(pattern)) {
        expect(pattern.length).toBeGreaterThan(0);
        for (const entry of pattern) {
          expect(typeof entry).toBe("string");
          expect(entry.length).toBeGreaterThan(0);
        }
        continue;
      }

      expect(typeof pattern).toBe("string");
      expect(pattern.length).toBeGreaterThan(0);
    }
  });

  it("uses unique criterion IDs", () => {
    const ids = CRITERIA.map((criterion) => criterion.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("limits level values to ACMM levels 0 through 6", () => {
    for (const criterion of CRITERIA) {
      if (criterion.level === undefined) {
        continue;
      }

      expect(Number.isInteger(criterion.level)).toBe(true);
      expect(criterion.level).toBeGreaterThanOrEqual(MIN_LEVEL);
      expect(criterion.level).toBeLessThanOrEqual(MAX_LEVEL);
    }
  });
});
