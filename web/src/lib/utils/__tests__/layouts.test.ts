/**
 * Unit tests for layout utility functions.
 *
 * Run: cd web && npx vitest run src/lib/utils/__tests__/layouts.test.ts
 */
import { describe, expect, it } from "vitest";
import {
  flexCenter,
  flexStart,
  flexWrapBetween,
  flexCenterJustify,
  flexCol,
  flexColCenter,
  LAYOUTS,
} from "../layouts";

describe("flexCenter", () => {
  it("defaults to gap-2", () => {
    expect(flexCenter()).toBe("flex items-center gap-2");
  });

  it("accepts custom numeric gap", () => {
    expect(flexCenter(1)).toBe("flex items-center gap-1");
    expect(flexCenter(4)).toBe("flex items-center gap-4");
  });

  it("accepts string gap", () => {
    expect(flexCenter("0.5")).toBe("flex items-center gap-0.5");
  });
});

describe("flexStart", () => {
  it("defaults to gap-2", () => {
    expect(flexStart()).toBe("flex items-start gap-2");
  });

  it("accepts custom gap", () => {
    expect(flexStart(3)).toBe("flex items-start gap-3");
  });
});

describe("flexWrapBetween", () => {
  it("defaults to gap-2", () => {
    expect(flexWrapBetween()).toBe("flex flex-wrap items-center justify-between gap-2");
  });

  it("accepts custom gap", () => {
    expect(flexWrapBetween(4)).toBe("flex flex-wrap items-center justify-between gap-4");
  });
});

describe("flexCenterJustify", () => {
  it("defaults to gap-1", () => {
    expect(flexCenterJustify()).toBe("flex items-center justify-center gap-1");
  });
});

describe("flexCol", () => {
  it("defaults to gap-4", () => {
    expect(flexCol()).toBe("flex flex-col gap-4");
  });

  it("accepts custom gap", () => {
    expect(flexCol(2)).toBe("flex flex-col gap-2");
  });
});

describe("flexColCenter", () => {
  it("defaults to gap-2", () => {
    expect(flexColCenter()).toBe(
      "flex flex-col items-center justify-center min-h-card text-muted-foreground gap-2"
    );
  });

  it("accepts custom gap", () => {
    expect(flexColCenter(4)).toContain("gap-4");
  });
});

describe("LAYOUTS constants", () => {
  it("matches expected values for most common patterns", () => {
    expect(LAYOUTS.CENTER_GAP_2).toBe("flex items-center gap-2");
    expect(LAYOUTS.CENTER_GAP_1).toBe("flex items-center gap-1");
    expect(LAYOUTS.CENTER_GAP_3).toBe("flex items-center gap-3");
    expect(LAYOUTS.START_GAP_2).toBe("flex items-start gap-2");
  });

  it("WRAP_BETWEEN_GAP_2 matches flexWrapBetween() default", () => {
    expect(LAYOUTS.WRAP_BETWEEN_GAP_2).toBe(flexWrapBetween());
  });

  it("CENTER_JUSTIFY_GAP_1 matches flexCenterJustify() default", () => {
    expect(LAYOUTS.CENTER_JUSTIFY_GAP_1).toBe(flexCenterJustify());
  });

  it("COL_CENTER_EMPTY matches flexColCenter() default", () => {
    expect(LAYOUTS.COL_CENTER_EMPTY).toBe(flexColCenter());
  });
});
