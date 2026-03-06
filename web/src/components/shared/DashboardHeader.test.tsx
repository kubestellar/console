/**
 * Unit tests for DashboardHeader — Pin checkbox re-sync behaviour.
 *
 * The core issue (GitHub bug report):
 *   KeepAlive keeps every cached route's component alive in the DOM.  When
 *   the user navigates from Dashboard-1 → Dashboard-2, Dashboard-1's
 *   DashboardHeader is still mounted and receives Dashboard-2's
 *   location.pathname via React Router context.
 *
 *   Old (broken) code:
 *     useEffect(() => {
 *       setRememberPositionState(getRememberPosition(location.pathname))
 *     }, [location.pathname])
 *   → fires for EVERY pathname change, including other dashboards' paths.
 *
 *   New (fixed) code:
 *     const ownPath = ownPathRef.current   // captured once on mount
 *     useEffect(() => {
 *       if (location.pathname === ownPath) {
 *         setRememberPositionState(getRememberPosition(ownPath))
 *       }
 *     }, [location.pathname, ownPath])
 *   → only syncs when THIS dashboard becomes active again.
 *
 * These tests exercise the per-path storage logic that underpins the fix,
 * and the rendered checkbox state by rendering DashboardHeader at different
 * simulated locations.
 */

import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import {
  MemoryRouter,
  Routes,
  Route,
  useNavigate,
  useLocation,
} from "react-router-dom";
import { DashboardHeader } from "./DashboardHeader";
import {
  getRememberPosition,
  setRememberPosition,
} from "../../hooks/useLastRoute";

// ─── Helpers ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});

/**
 * Renders a DashboardHeader at the given initialPath.
 * Returns helpers to read the checkbox and navigate.
 */
function renderAt(
  initialPath: string,
  { pinOn = false }: { pinOn?: boolean } = {},
) {
  if (pinOn) setRememberPosition(initialPath, true);

  const { rerender } = render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route
          path="*"
          element={
            <DashboardHeader
              title="Test Dashboard"
              subtitle="subtitle"
              isFetching={false}
              onRefresh={vi.fn()}
              autoRefreshId="test-ar"
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  );

  const getCheckbox = () =>
    screen.getByRole("checkbox", { name: /pin/i }) as HTMLInputElement;

  return { rerender, getCheckbox };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("DashboardHeader — Pin checkbox initial state", () => {
  it("shows unchecked when no pin preference is stored for the path", () => {
    const { getCheckbox } = renderAt("/custom-dashboard/d1");
    expect(getCheckbox().checked).toBe(false);
  });

  it("shows checked when pin preference was stored as true for the path", () => {
    setRememberPosition("/custom-dashboard/d1", true);
    const { getCheckbox } = renderAt("/custom-dashboard/d1");
    expect(getCheckbox().checked).toBe(true);
  });

  it("shows unchecked even when a DIFFERENT path has pin=true", () => {
    setRememberPosition("/custom-dashboard/d2", true);
    const { getCheckbox } = renderAt("/custom-dashboard/d1");
    expect(getCheckbox().checked).toBe(false);
  });
});

describe("DashboardHeader — Pin checkbox onChange", () => {
  it("persists true to localStorage when toggled on", () => {
    const { getCheckbox } = renderAt("/custom-dashboard/d1");
    act(() => {
      fireEvent.click(getCheckbox());
    });
    expect(getRememberPosition("/custom-dashboard/d1")).toBe(true);
  });

  it("persists false to localStorage when toggled off", () => {
    const { getCheckbox } = renderAt("/custom-dashboard/d1", { pinOn: true });
    act(() => {
      fireEvent.click(getCheckbox());
    });
    expect(getRememberPosition("/custom-dashboard/d1")).toBe(false);
  });

  it("writes to the component OWN path, not a different path", () => {
    setRememberPosition("/custom-dashboard/d2", false);
    const { getCheckbox } = renderAt("/custom-dashboard/d1");
    act(() => {
      fireEvent.click(getCheckbox());
    });

    // D1 updated
    expect(getRememberPosition("/custom-dashboard/d1")).toBe(true);
    // D2 NOT touched
    expect(getRememberPosition("/custom-dashboard/d2")).toBe(false);
  });
});

describe("DashboardHeader — Pin re-sync on navigation back to own path", () => {
  /**
   * Helper: renders a two-route app so we can actually navigate within the
   * same MemoryRouter (the only way to get location.pathname to change).
   *
   * Route /d1 renders a DashboardHeader for D1.
   * Route /d2 renders a plain div so we can navigate away cleanly.
   * A nav button lets us drive navigation programmatically.
   */
  function renderNavigableApp(d1PinOn: boolean) {
    if (d1PinOn) setRememberPosition("/custom-dashboard/d1", true);

    // A tiny helper that exposes navigate via a button
    function NavButtons() {
      const navigate = useNavigate();
      return (
        <>
          <button
            onClick={() => navigate("/custom-dashboard/d1")}
            data-testid="go-d1"
          >
            go-d1
          </button>
          <button
            onClick={() => navigate("/custom-dashboard/d2")}
            data-testid="go-d2"
          >
            go-d2
          </button>
        </>
      );
    }

    render(
      <MemoryRouter initialEntries={["/custom-dashboard/d1"]}>
        <NavButtons />
        <Routes>
          <Route
            path="/custom-dashboard/d1"
            element={
              <DashboardHeader
                title="D1"
                subtitle=""
                isFetching={false}
                onRefresh={vi.fn()}
                autoRefreshId="d1-sync"
              />
            }
          />
          <Route
            path="/custom-dashboard/d2"
            element={<div data-testid="d2-page" />}
          />
        </Routes>
      </MemoryRouter>,
    );

    const navigate = (dest: string) =>
      act(() => {
        fireEvent.click(
          screen.getByTestId(
            dest === "/custom-dashboard/d1" ? "go-d1" : "go-d2",
          ),
        );
      });

    const getCheckbox = () =>
      screen.getByRole("checkbox", { name: /pin/i }) as HTMLInputElement;

    return { navigate, getCheckbox };
  }

  it("re-reads stored pin state when navigating back to own path", () => {
    const { navigate, getCheckbox } = renderNavigableApp(true);

    // Starting: D1 is visible, pin=true
    expect(getCheckbox().checked).toBe(true);

    // Toggle pin OFF
    act(() => {
      fireEvent.click(getCheckbox());
    });
    expect(getCheckbox().checked).toBe(false);
    expect(getRememberPosition("/custom-dashboard/d1")).toBe(false);

    // External code re-enables pin in storage (simulates import / other tab)
    setRememberPosition("/custom-dashboard/d1", true);

    // Navigate away to D2 — checkbox is gone from DOM
    navigate("/custom-dashboard/d2");
    expect(screen.queryByRole("checkbox", { name: /pin/i })).toBeNull();

    // Navigate back to D1 — DashboardHeader mounts fresh and reads storage
    navigate("/custom-dashboard/d1");
    // After navigating back the header is in the DOM, pin should be re-synced
    expect(getCheckbox().checked).toBe(true);
  });

  it("shows false when navigating back and stored value is false", () => {
    setRememberPosition("/custom-dashboard/d1", false);
    const { navigate, getCheckbox } = renderNavigableApp(false);
    expect(getCheckbox().checked).toBe(false);

    navigate("/custom-dashboard/d2");
    navigate("/custom-dashboard/d1");
    expect(getCheckbox().checked).toBe(false);
  });
});

describe("DashboardHeader — KeepAlive cross-contamination prevention", () => {
  /**
   * This test replicates the KeepAlive scenario:
   *   - D1's DashboardHeader is mounted at path '/d1'
   *   - location.pathname then changes to '/d2' (user navigated to D2)
   *   - The component should NOT update its pin state from D2's storage
   *   - When location.pathname returns to '/d1', the component SHOULD re-sync
   */
  /**
   * True KeepAlive simulation:
   *   D1's DashboardHeader is mounted FIRST (when location = /d1).
   *   Then we navigate to /d2 — D2's DashboardHeader mounts at location=/d2.
   *   Both stay in the DOM (display toggled, not unmounted).
   *   D1's ownPath was captured when location was /d1 — so the fix's gate
   *   (`if (location.pathname === ownPath)`) must prevent D1 from reading
   *   D2's pin value when location switches to /d2.
   */
  it("D1 header does not change its pin state when location switches to D2", () => {
    setRememberPosition("/custom-dashboard/d1", true);
    setRememberPosition("/custom-dashboard/d2", false);

    // Minimal KeepAlive: mount each route on first visit, keep it alive via
    // a cached Map (same approach as KeepAliveOutlet in production).
    function MiniKeepAlive() {
      const navigate = useNavigate();
      const loc = useLocation();
      // Using useRef to hold the cache across renders
      const cacheRef = React.useRef<Map<string, React.ReactNode>>(new Map());
      const cache = cacheRef.current;

      // Mount the current route if not already cached
      if (!cache.has(loc.pathname)) {
        const id = loc.pathname === "/custom-dashboard/d1" ? "d1-ka" : "d2-ka";
        cache.set(
          loc.pathname,
          <DashboardHeader
            key={loc.pathname}
            title={id}
            subtitle=""
            isFetching={false}
            onRefresh={vi.fn()}
            autoRefreshId={id}
          />,
        );
      }

      return (
        <>
          <button
            onClick={() => navigate("/custom-dashboard/d1")}
            data-testid="go-d1"
          />
          <button
            onClick={() => navigate("/custom-dashboard/d2")}
            data-testid="go-d2"
          />
          {Array.from(cache.entries()).map(([path, element]) => (
            <div
              key={path}
              style={{ display: path === loc.pathname ? "block" : "none" }}
            >
              {element}
            </div>
          ))}
        </>
      );
    }

    render(
      <MemoryRouter initialEntries={["/custom-dashboard/d1"]}>
        <MiniKeepAlive />
      </MemoryRouter>,
    );

    // D1 is mounted, ownPath = '/custom-dashboard/d1', pin = true
    const d1Checkbox = () =>
      document.getElementById("remember-position-d1-ka") as HTMLInputElement;
    expect(d1Checkbox().checked).toBe(true);

    // Navigate to D2 — D2 mounts (ownPath = '/d2', pin = false),
    // D1 stays alive (display:none) but its location context changes to /d2
    act(() => {
      fireEvent.click(screen.getByTestId("go-d2"));
    });

    const d2Checkbox = () =>
      document.getElementById("remember-position-d2-ka") as HTMLInputElement;

    // D2's checkbox should show false (its own stored value)
    expect(d2Checkbox().checked).toBe(false);

    // D1's checkbox must NOT have flipped to false.
    // The fix gates: `if (location.pathname === ownPath)` — since '/d2' ≠ '/d1',
    // D1's state is left untouched.
    expect(d1Checkbox().checked).toBe(true);
  });

  it("two independently mounted headers each read their own path", () => {
    setRememberPosition("/custom-dashboard/d1", true);
    setRememberPosition("/custom-dashboard/d2", false);

    // Render both headers simultaneously (mimicking KeepAlive keeping both alive)
    const { unmount: unmountD2 } = render(
      <MemoryRouter initialEntries={["/custom-dashboard/d2"]}>
        <Routes>
          <Route
            path="*"
            element={
              <DashboardHeader
                title="D2 Header"
                subtitle=""
                isFetching={false}
                onRefresh={vi.fn()}
                autoRefreshId="d2-ar"
              />
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    render(
      <MemoryRouter initialEntries={["/custom-dashboard/d1"]}>
        <Routes>
          <Route
            path="*"
            element={
              <DashboardHeader
                title="D1 Header"
                subtitle=""
                isFetching={false}
                onRefresh={vi.fn()}
                autoRefreshId="d1-ar"
              />
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    // D2's checkbox (autoRefreshId="d2-ar") should be unchecked (pin=false)
    const d2Checkbox = document.getElementById(
      "remember-position-d2-ar",
    ) as HTMLInputElement;
    expect(d2Checkbox?.checked).toBe(false);

    // D1's checkbox (autoRefreshId="d1-ar") should be checked (pin=true)
    const d1Checkbox = document.getElementById(
      "remember-position-d1-ar",
    ) as HTMLInputElement;
    expect(d1Checkbox?.checked).toBe(true);

    unmountD2();
  });
});
