/**
 * Unit tests for useLastRoute — focused on the Pin / scroll-position bugs.
 *
 * Bug 1 (scroll-position bleed): The debounced scroll-save handler must
 *   capture the path at SCROLL TIME, not at timer-fire time.  When a user
 *   scrolls on Dashboard-2 and navigates to Dashboard-1 before the 2 s
 *   debounce fires, the deferred save must still write to Dashboard-2's key,
 *   not Dashboard-1's key.
 *
 * Bug 2 (pin state re-sync): getRememberPosition / setRememberPosition must
 *   correctly read and write per-path preferences so that the DashboardHeader
 *   re-sync logic (which now gates on ownPath) works correctly.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getRememberPosition, setRememberPosition } from "./useLastRoute";

// ─── localStorage key constants (for test clarity) ─────────────────────────
const REMEMBER_KEY = "kubestellar-remember-position";
const SCROLL_KEY = "kubestellar-scroll-positions";

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});

// ─── getRememberPosition / setRememberPosition ────────────────────────────────

describe("getRememberPosition", () => {
  it("returns false for an unknown path", () => {
    expect(getRememberPosition("/unknown")).toBe(false);
  });

  it("returns false when localStorage has no entry for the path", () => {
    setRememberPosition("/other", true);
    expect(getRememberPosition("/my-dashboard")).toBe(false);
  });

  it("returns true after setRememberPosition(path, true)", () => {
    setRememberPosition("/dashboard/abc", true);
    expect(getRememberPosition("/dashboard/abc")).toBe(true);
  });

  it("returns false after setRememberPosition(path, false)", () => {
    setRememberPosition("/dashboard/abc", true);
    setRememberPosition("/dashboard/abc", false);
    expect(getRememberPosition("/dashboard/abc")).toBe(false);
  });

  it("stores preferences independently per path", () => {
    setRememberPosition("/custom-dashboard/d1", true);
    setRememberPosition("/custom-dashboard/d2", false);
    expect(getRememberPosition("/custom-dashboard/d1")).toBe(true);
    expect(getRememberPosition("/custom-dashboard/d2")).toBe(false);
  });

  it("does not throw when localStorage contains invalid JSON", () => {
    localStorage.setItem(REMEMBER_KEY, "{not-valid-json}");
    expect(() => getRememberPosition("/any")).not.toThrow();
    expect(getRememberPosition("/any")).toBe(false);
  });
});

describe("setRememberPosition", () => {
  it("persists the value into localStorage keyed by path", () => {
    setRememberPosition("/workloads", true);
    const stored = JSON.parse(localStorage.getItem(REMEMBER_KEY)!);
    expect(stored["/workloads"]).toBe(true);
  });

  it("does not overwrite other paths when updating one", () => {
    setRememberPosition("/custom-dashboard/d1", true);
    setRememberPosition("/custom-dashboard/d2", true);
    setRememberPosition("/custom-dashboard/d1", false);

    expect(getRememberPosition("/custom-dashboard/d1")).toBe(false);
    expect(getRememberPosition("/custom-dashboard/d2")).toBe(true);
  });

  it("does not throw when localStorage contains invalid JSON", () => {
    localStorage.setItem(REMEMBER_KEY, "bad");
    expect(() => setRememberPosition("/x", true)).not.toThrow();
    // The write is silently dropped when the existing value is unparseable,
    // so getRememberPosition also returns the default (false).
    expect(getRememberPosition("/x")).toBe(false);
  });
});

// ─── Debounce path-capture regression ────────────────────────────────────────
// These tests directly exercise the scroll-save handler by simulating
// the exact race conditions the bugs introduced.
//
// The handler in useLastRoute now does:
//   if (isNavigatingRef.current || isRestoringRef.current) return;  // guard FIRST
//   clearTimeout(timeoutId);
//   const capturedPath = pathnameRef.current;         // captured at scroll time
//   const capturedScrollTop = container.scrollTop;     // captured at scroll time
//   timeoutId = setTimeout(() => { save(capturedPath, capturedScrollTop) }, 2000)
//
// Key behaviours:
//   • Path AND scrollTop are captured when the user scrolls, not when the
//     debounce timer fires.
//   • The navigation guard returns BEFORE clearTimeout, so a pending save
//     from another dashboard is NOT cancelled by synthetic scroll events
//     during the KeepAlive DOM flip.

describe("scroll-save debounce captures path AND scrollTop at scroll time", () => {
  /**
   * Simulates the production handleScroll closure in isolation.
   * Mirrors the guard → clearTimeout → capture → setTimeout flow.
   */
  function makeHandler(getPathnameRef: () => string) {
    const saves: Array<{ path: string; position: number }> = [];
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let navigating = false;
    let restoring = false;

    const handleScroll = (currentScrollTop: number) => {
      // Guard BEFORE clearTimeout — prevents cancelling pending saves
      if (navigating || restoring) return;

      if (timeoutId !== undefined) clearTimeout(timeoutId);

      // Capture at scroll time (the fix)
      const capturedPath = getPathnameRef();
      const capturedScrollTop = currentScrollTop;

      timeoutId = setTimeout(() => {
        if (restoring) return;
        saves.push({ path: capturedPath, position: capturedScrollTop });
      }, 2000);
    };

    return {
      handleScroll,
      saves,
      setNavigating(v: boolean) {
        navigating = v;
      },
      setRestoring(v: boolean) {
        restoring = v;
      },
    };
  }

  it("saves the position under the path that was active at scroll time, even after navigation", () => {
    let currentPath = "/custom-dashboard/d2";
    const { handleScroll, saves } = makeHandler(() => currentPath);

    // User scrolls on Dashboard-2
    handleScroll(500);

    // User navigates to Dashboard-1 before the 2 s debounce fires
    currentPath = "/custom-dashboard/d1";

    // Advance time — debounce fires
    vi.advanceTimersByTime(2000);

    // The save should be under D2's path, not D1's
    expect(saves).toHaveLength(1);
    expect(saves[0].path).toBe("/custom-dashboard/d2");
    expect(saves[0].position).toBe(500);
  });

  it("captures scrollTop at scroll time, not at timer-fire time", () => {
    const currentPath = "/custom-dashboard/d1";
    const { handleScroll, saves } = makeHandler(() => currentPath);

    // Simulates: user scrolled to 500, then <main> was reset to 0 by navigation
    // The handler captures 500 at scroll time, not whatever <main> shows later.
    handleScroll(500);

    // Even though a real container.scrollTop would now be 0 after navigation,
    // the captured value (500) is what gets saved.
    vi.advanceTimersByTime(2000);

    expect(saves).toHaveLength(1);
    expect(saves[0].position).toBe(500);
  });

  it("navigation guard blocks synthetic scroll events and preserves pending save", () => {
    let currentPath = "/custom-dashboard/d2";
    const { handleScroll, saves, setNavigating } = makeHandler(
      () => currentPath,
    );

    // User scrolls on D2 — pending save for D2 is queued
    handleScroll(400);

    // Navigation starts — isNavigatingRef = true
    setNavigating(true);
    currentPath = "/custom-dashboard/d1";

    // KeepAlive DOM flip causes a synthetic scroll event.
    // Because the guard returns BEFORE clearTimeout, the pending D2 save
    // is NOT cancelled.
    handleScroll(0); // this call should be a no-op

    // The D2 save fires undisturbed
    vi.advanceTimersByTime(2000);

    expect(saves).toHaveLength(1);
    expect(saves[0].path).toBe("/custom-dashboard/d2");
    expect(saves[0].position).toBe(400);
  });

  it("debounce resets on rapid scrolls — only the LAST scroll event saves", () => {
    const currentPath = "/clusters";
    const { handleScroll, saves } = makeHandler(() => currentPath);

    handleScroll(100);
    vi.advanceTimersByTime(1000); // still within debounce window
    handleScroll(200); // resets the timer
    vi.advanceTimersByTime(2000); // now the second timer fires

    expect(saves).toHaveLength(1);
    expect(saves[0].position).toBe(200);
  });

  it("restoring guard skips saves during scroll restoration", () => {
    const currentPath = "/custom-dashboard/d1";
    const { handleScroll, saves, setRestoring } = makeHandler(
      () => currentPath,
    );

    setRestoring(true);
    handleScroll(300); // blocked by guard
    vi.advanceTimersByTime(2000);

    expect(saves).toHaveLength(0);

    // After restore completes, normal saves resume
    setRestoring(false);
    handleScroll(300);
    vi.advanceTimersByTime(2000);

    expect(saves).toHaveLength(1);
    expect(saves[0].position).toBe(300);
  });

  it("if navigating AFTER the debounce already fired — save is to D2 (no cross-contamination)", () => {
    let currentPath = "/custom-dashboard/d2";
    const { handleScroll, saves } = makeHandler(() => currentPath);

    handleScroll(600);
    vi.advanceTimersByTime(2000); // D2's save fires

    currentPath = "/custom-dashboard/d1"; // navigate after timer
    vi.advanceTimersByTime(1000); // no more timers pending

    expect(saves).toHaveLength(1);
    expect(saves[0].path).toBe("/custom-dashboard/d2");
  });
});

// ─── Pin state isolation across dashboards ────────────────────────────────────
// These tests validate that the ownPath-based DashboardHeader logic is
// correctly backed by per-path storage.  The component fix relies on:
//   1. getRememberPosition(ownPath) returning the right value on mount, AND
//   2. The effect gating: `if (location.pathname === ownPath)` before syncing.

describe("per-path pin isolation (backing store for DashboardHeader fix)", () => {
  it("setting pin on D1 does not affect D2", () => {
    setRememberPosition("/custom-dashboard/d1", true);
    expect(getRememberPosition("/custom-dashboard/d2")).toBe(false);
  });

  it("toggling pin off on D1 does not affect D2", () => {
    setRememberPosition("/custom-dashboard/d1", true);
    setRememberPosition("/custom-dashboard/d2", true);
    setRememberPosition("/custom-dashboard/d1", false);

    expect(getRememberPosition("/custom-dashboard/d1")).toBe(false);
    expect(getRememberPosition("/custom-dashboard/d2")).toBe(true);
  });

  it("a component mounting on its own path reads the correct stored value", () => {
    // Simulate: user previously pinned /custom-dashboard/d1
    setRememberPosition("/custom-dashboard/d1", true);

    // Component mounts on /custom-dashboard/d1
    const ownPath = "/custom-dashboard/d1";
    const initial = getRememberPosition(ownPath);
    expect(initial).toBe(true);
  });

  it("a component mounting on a fresh path gets false (default off)", () => {
    // No prior entry in storage
    const ownPath = "/custom-dashboard/new-dashboard";
    const initial = getRememberPosition(ownPath);
    expect(initial).toBe(false);
  });

  it("KeepAlive scenario: reading D2 path from D1 component must not corrupt D1 state", () => {
    // The bug: D1's component (ownPath = 'd1') was doing:
    //   setRememberPositionState(getRememberPosition(location.pathname))
    // even when location.pathname == 'd2'.
    // The fix is in the component — but the backing store must be independent.
    setRememberPosition("/custom-dashboard/d1", true);
    setRememberPosition("/custom-dashboard/d2", false);

    // Simulate what the old (broken) code did: read D2's value and compare
    const d2Value = getRememberPosition("/custom-dashboard/d2");
    expect(d2Value).toBe(false);

    // D1's backing store is untouched
    expect(getRememberPosition("/custom-dashboard/d1")).toBe(true);
  });
});

// ─── Scroll-positions localStorage helpers ───────────────────────────────────

describe("scroll-positions storage integrity", () => {
  function savePosition(path: string, position: number) {
    const stored = JSON.parse(localStorage.getItem(SCROLL_KEY) || "{}");
    stored[path] = { position, cardTitle: undefined };
    localStorage.setItem(SCROLL_KEY, JSON.stringify(stored));
  }

  function loadPosition(path: string): number | undefined {
    const stored = JSON.parse(localStorage.getItem(SCROLL_KEY) || "{}");
    const entry = stored[path];
    if (entry === undefined) return undefined;
    return typeof entry === "number" ? entry : entry.position;
  }

  it("stores positions independently per path", () => {
    savePosition("/custom-dashboard/d1", 400);
    savePosition("/custom-dashboard/d2", 900);

    expect(loadPosition("/custom-dashboard/d1")).toBe(400);
    expect(loadPosition("/custom-dashboard/d2")).toBe(900);
  });

  it("overwriting D1 position does not affect D2", () => {
    savePosition("/custom-dashboard/d1", 400);
    savePosition("/custom-dashboard/d2", 900);
    savePosition("/custom-dashboard/d1", 200);

    expect(loadPosition("/custom-dashboard/d1")).toBe(200);
    expect(loadPosition("/custom-dashboard/d2")).toBe(900);
  });

  it("returns undefined for a path with no saved position", () => {
    expect(loadPosition("/custom-dashboard/never-visited")).toBeUndefined();
  });
});
