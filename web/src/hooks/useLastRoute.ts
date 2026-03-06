import { useEffect, useLayoutEffect, useRef, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { FOCUS_DELAY_MS } from "../lib/constants/network";

const LAST_ROUTE_KEY = "kubestellar-last-route";
const SCROLL_POSITIONS_KEY = "kubestellar-scroll-positions";
const REMEMBER_POSITION_KEY = "kubestellar-remember-position";
const SIDEBAR_CONFIG_KEY = "kubestellar-sidebar-config-v5";
const LAST_ROUTE_RESTORE_DELAY_MS = 150; // Wait for a route to finish rendering before restoring scroll
const SCROLL_SAVE_DEBOUNCE_MS = 2000; // Debounce scroll saves to avoid thrashing localStorage
const PIN_RESTORE_DELAY_MS = 50; // Delay before restoring pinned scroll after the KeepAlive DOM flip
const SCROLL_HANDLER_REENABLE_DELAY_MS = 200; // Give restoration time before re-enabling the scroll handler
const PIN_OFF_SCROLL_HANDLER_DELAY_MS = 100; // Allow the new route to settle before re-enabling the handler when pin is off

/**
 * Get the first dashboard route from sidebar configuration.
 * Falls back to '/' if no sidebar config exists.
 */
function getFirstDashboardRoute(): string {
  try {
    const sidebarConfig = localStorage.getItem(SIDEBAR_CONFIG_KEY);
    if (sidebarConfig) {
      const config = JSON.parse(sidebarConfig);
      if (config.primaryNav && config.primaryNav.length > 0) {
        return config.primaryNav[0].href || "/";
      }
    }
  } catch {
    // Fall through to default
  }
  return "/";
}

interface ScrollEntry {
  position: number;
  cardTitle?: string; // title of card at viewport top, for robust restore
}

interface ScrollPositions {
  [path: string]: ScrollEntry | number; // number for backward compat
}

/**
 * Get the scrollable main content element.
 * The layout uses a <main> with overflow-y-auto, not window scroll.
 */
function getScrollContainer(): Element | null {
  return document.querySelector("main");
}

/**
 * Hook to persist and restore the last visited route and scroll position.
 * Saves the current route on navigation and scroll position on scroll/unload.
 * On initial app load, redirects to the last route and restores scroll.
 */
export function useLastRoute() {
  const location = useLocation();
  const navigate = useNavigate();
  const hasRestoredRef = useRef(false);
  const isRestoringRef = useRef(false); // true while iterative restore is running
  const isNavigatingRef = useRef(false); // true during KeepAlive navigation transition
  const pathnameRef = useRef(location.pathname);

  // NOTE: pathnameRef is updated via an effect at the bottom of this hook, NOT
  // here in the render body.  Updating synchronously would cause scroll events
  // during the KeepAlive DOM flip to capture the NEW path while <main> still
  // shows the OLD page's content, saving the wrong scroll position.

  // Get stored scroll positions
  const getScrollPositions = useCallback((): ScrollPositions => {
    try {
      return JSON.parse(localStorage.getItem(SCROLL_POSITIONS_KEY) || "{}");
    } catch {
      return {};
    }
  }, []);

  // Save scroll position for a given path immediately (no debounce).
  // Snaps to the nearest card top boundary so restoration shows full cards.
  // Also saves the card title for robust restore across layout shifts.
  const saveScrollPositionNow = useCallback(
    (path: string) => {
      try {
        if (isRestoringRef.current) return;
        const container = getScrollContainer();
        if (!container) return;
        const scrollTop = container.scrollTop;

        const positions = getScrollPositions();

        // At the top — clear saved position so next visit starts at top.
        // This ensures scrolling to top is "sticky" when Pin is on.
        if (scrollTop <= 0) {
          delete positions[path];
          localStorage.setItem(SCROLL_POSITIONS_KEY, JSON.stringify(positions));
          return;
        }

        // Find the first card visible at the viewport top.
        // Cards are in a grid so multiple cards can share the same row.
        // We want the first card (left-most in DOM) on the row nearest
        // the viewport top, using a 20px tolerance for breathing room.
        //
        // OPTIMIZATION: Only check the first few cards to avoid forced reflow
        // on every card. Most users don't scroll past the first ~10 cards.
        let snapped = scrollTop;
        let cardTitle: string | undefined;
        const cards = container.querySelectorAll('[data-tour="card"]');
        const maxCardsToCheck = Math.min(cards.length, 12); // Only check first 12 cards
        if (maxCardsToCheck > 0) {
          const containerRect = container.getBoundingClientRect();
          // Find the last row whose top is at or above the viewport top + tolerance.
          // Then pick the FIRST card on that row (first in DOM order).
          let bestRowTop = -1;
          let bestCard: Element | null = null;
          for (let i = 0; i < maxCardsToCheck; i++) {
            const cardRect = cards[i].getBoundingClientRect();
            const cardAbsTop = cardRect.top - containerRect.top + scrollTop;
            if (cardAbsTop <= scrollTop + 20) {
              // New row detected (position differs by more than 2px from last row)
              if (Math.abs(cardAbsTop - bestRowTop) > 2) {
                bestRowTop = cardAbsTop;
                bestCard = cards[i]; // first card on this new row
              }
              // Same row — keep the first card (don't update bestCard)
            } else {
              break;
            }
          }
          if (bestCard && bestRowTop >= 0) {
            snapped = Math.max(0, bestRowTop - 12); // 12px breathing room above card
            const titleEl = bestCard.querySelector("h3");
            if (titleEl) cardTitle = titleEl.textContent?.trim();
          }
        }

        positions[path] = { position: snapped, cardTitle };
        localStorage.setItem(SCROLL_POSITIONS_KEY, JSON.stringify(positions));
      } catch {
        // Ignore localStorage errors
      }
    },
    [getScrollPositions],
  );

  // Restore scroll position for a path, iterating as lazy content loads.
  // Uses card title for identity-based restore (robust across layout shifts),
  // falling back to pixel position. Retries to let lazy content stabilize.
  const restoreScrollPosition = useCallback(
    (path: string) => {
      const positions = getScrollPositions();
      const entry = positions[path];
      if (entry === undefined) return;

      // Handle backward compat (old format was just a number)
      const savedPosition = typeof entry === "number" ? entry : entry.position;
      const cardTitle = typeof entry === "number" ? undefined : entry.cardTitle;
      if (savedPosition <= 0) return;

      const container = getScrollContainer();
      if (!container) return;

      let attempts = 0;
      const maxAttempts = 10; // 10 × 100ms = 1s max (reduced from 6s)
      const minAttempts = 3; // min attempts to let content stabilize
      let lastTarget = -1;
      isRestoringRef.current = true;

      const tryRestore = () => {
        let target = savedPosition;

        // Prefer card-based restore for robustness across layout shifts
        // Only do expensive DOM queries if we have a card title to find
        // OPTIMIZATION: Check title text FIRST (cheap) before calling getBoundingClientRect (expensive)
        if (cardTitle) {
          const cards = container.querySelectorAll('[data-tour="card"]');
          // Find the card by title first without measuring
          let targetCard: Element | null = null;
          for (let i = 0; i < cards.length; i++) {
            const titleEl = cards[i].querySelector("h3");
            if (titleEl?.textContent?.trim() === cardTitle) {
              targetCard = cards[i];
              break;
            }
          }
          // Only measure if we found the card
          if (targetCard) {
            const containerRect = container.getBoundingClientRect();
            const scrollTop = container.scrollTop;
            const cardRect = targetCard.getBoundingClientRect();
            target = Math.max(
              0,
              cardRect.top - containerRect.top + scrollTop - 12,
            );
          }
        }

        container.scrollTo({ top: target, behavior: "instant" });
        attempts++;

        if (attempts >= maxAttempts) {
          isRestoringRef.current = false;
          return;
        }

        // Stop early when position stabilizes (within 5px tolerance)
        if (attempts >= minAttempts && Math.abs(target - lastTarget) < 5) {
          isRestoringRef.current = false;
          return;
        }
        lastTarget = target;

        // Use shorter delay for faster convergence
        requestAnimationFrame(() => {
          setTimeout(tryRestore, FOCUS_DELAY_MS);
        });
      };

      tryRestore();
    },
    [getScrollPositions],
  );

  // Save last route on path change
  useEffect(() => {
    // Don't track auth-related pages
    if (
      location.pathname.startsWith("/auth") ||
      location.pathname === "/login"
    ) {
      return;
    }

    try {
      localStorage.setItem(LAST_ROUTE_KEY, location.pathname + location.search);
    } catch {
      // Ignore localStorage errors
    }

    // NOTE: scroll position is NOT saved in the cleanup here.  With KeepAlive,
    // cleanup runs AFTER the DOM visibility flip, so container.scrollTop
    // reflects the NEW page, not the page being left.  Scroll positions are
    // persisted by the scroll event handler instead.
  }, [location.pathname, location.search]);

  // Restore last route on initial mount
  useEffect(() => {
    if (hasRestoredRef.current) return;
    hasRestoredRef.current = true;

    if (location.pathname !== "/") return;

    // Don't redirect away from '/' when deep link params are present —
    // let useDeepLink handle them on the current route.
    const params = new URLSearchParams(location.search);
    if (
      params.has("card") ||
      params.has("drilldown") ||
      params.has("action") ||
      params.has("mission")
    )
      return;

    try {
      const lastRoute = localStorage.getItem(LAST_ROUTE_KEY);
      const firstSidebarRoute = getFirstDashboardRoute();

      // If lastRoute is '/' or same as current, no redirect needed
      if (lastRoute && lastRoute !== "/" && lastRoute !== location.pathname) {
        navigate(lastRoute, { replace: true });
        setTimeout(() => {
          restoreScrollPosition(lastRoute);
        }, LAST_ROUTE_RESTORE_DELAY_MS);
      } else if (!lastRoute && firstSidebarRoute && firstSidebarRoute !== "/") {
        // Only use firstSidebarRoute if no lastRoute was saved
        navigate(firstSidebarRoute, { replace: true });
      }
      // If lastRoute is '/', stay on '/' (Dashboard) - no action needed
    } catch {
      // Ignore localStorage errors
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Block the scroll handler the instant a navigation commits to the DOM.
  // useLayoutEffect fires synchronously after the DOM update, BEFORE the
  // browser processes layout/paint, so scroll events from the KeepAlive
  // visibility flip see isNavigatingRef=true and bail out.
  useLayoutEffect(() => {
    if (hasRestoredRef.current) {
      isNavigatingRef.current = true;
    }
  }, [location.pathname]);

  // Continuously save scroll position on scroll (debounced).
  // Captures BOTH path and scrollTop at scroll-event time so the deferred
  // save writes the correct values even after the user has navigated away.
  // (With KeepAlive the <main> container is shared across dashboards, so
  // reading scrollTop after a navigation would return the NEW page's position.)
  useEffect(() => {
    const container = getScrollContainer();
    if (!container) return;

    let timeoutId: ReturnType<typeof setTimeout>;
    const handleScroll = () => {
      // During navigation or restoration the scroll events are synthetic
      // (KeepAlive DOM flip / programmatic scrollTo).  Don't cancel a pending
      // real save and don't record the transitional position.
      if (isNavigatingRef.current || isRestoringRef.current) return;

      clearTimeout(timeoutId);

      // Capture BOTH path and position NOW (at scroll time, not timer-fire time).
      const capturedPath = pathnameRef.current;
      const capturedScrollTop = container.scrollTop;

      timeoutId = setTimeout(() => {
        try {
          if (isRestoringRef.current) return;
          const positions = getScrollPositions();
          if (capturedScrollTop <= 0) {
            delete positions[capturedPath];
          } else {
            positions[capturedPath] = { position: capturedScrollTop };
          }
          localStorage.setItem(SCROLL_POSITIONS_KEY, JSON.stringify(positions));
        } catch {
          // Ignore localStorage errors
        }
      }, SCROLL_SAVE_DEBOUNCE_MS);
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      clearTimeout(timeoutId);
      container.removeEventListener("scroll", handleScroll);
    };
  }, [getScrollPositions]);

  // Save scroll position on beforeunload
  useEffect(() => {
    const handleBeforeUnload = () => {
      saveScrollPositionNow(pathnameRef.current);
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [saveScrollPositionNow]);

  // On navigation: always reset scroll, then restore if "remember position" is on.
  // With KeepAlive, <main> retains the previous dashboard's scroll offset after
  // the DOM visibility flip.  Scrolling to top FIRST prevents the new dashboard
  // from appearing at the old dashboard's scroll position.
  useEffect(() => {
    if (!hasRestoredRef.current) return;

    const container = getScrollContainer();
    if (!container) return;

    // isNavigatingRef was already set true by the useLayoutEffect above.
    // ALWAYS scroll to top immediately — clears stale position from KeepAlive.
    container.scrollTo({ top: 0, behavior: "instant" });

    if (getRememberPosition(location.pathname)) {
      const restoreTimeout = setTimeout(() => {
        restoreScrollPosition(location.pathname);
        // Re-enable the scroll handler after restoration settles
        setTimeout(() => {
          isNavigatingRef.current = false;
        }, SCROLL_HANDLER_REENABLE_DELAY_MS);
      }, PIN_RESTORE_DELAY_MS);
      return () => {
        clearTimeout(restoreTimeout);
        isNavigatingRef.current = false;
      };
    } else {
      // Pin is off — stay at top.  Re-enable scroll handler after settle.
      const settleTimeout = setTimeout(() => {
        isNavigatingRef.current = false;
      }, PIN_OFF_SCROLL_HANDLER_DELAY_MS);
      return () => {
        clearTimeout(settleTimeout);
        isNavigatingRef.current = false;
      };
    }
  }, [location.pathname, restoreScrollPosition]);

  // Sync pathnameRef AFTER all other effects so that scroll events during
  // the KeepAlive DOM flip (between DOM commit and effect phase) still see
  // the OLD path in pathnameRef.  This is the last effect in the hook.
  useEffect(() => {
    pathnameRef.current = location.pathname;
  }, [location.pathname]);

  return {
    lastRoute: localStorage.getItem(LAST_ROUTE_KEY),
    scrollPositions: getScrollPositions(),
  };
}

/**
 * Get the last visited route without using the hook.
 * Useful for checking the last route outside of React components.
 */
export function getLastRoute(): string | null {
  try {
    return localStorage.getItem(LAST_ROUTE_KEY);
  } catch {
    return null;
  }
}

/**
 * Clear the last route and scroll positions.
 * Useful for logout or reset scenarios.
 */
export function clearLastRoute(): void {
  try {
    localStorage.removeItem(LAST_ROUTE_KEY);
    localStorage.removeItem(SCROLL_POSITIONS_KEY);
  } catch {
    // Ignore localStorage errors
  }
}

/**
 * Get the "remember scroll position" preference for a dashboard path.
 * Defaults to false (off) — pages scroll to top on navigation.
 * Users can toggle "Pin" on per-dashboard to preserve position.
 */
export function getRememberPosition(path: string): boolean {
  try {
    const stored = localStorage.getItem(REMEMBER_POSITION_KEY);
    if (stored) {
      const prefs = JSON.parse(stored);
      if (path in prefs) return prefs[path];
    }
  } catch {
    // Ignore
  }
  return false; // Default: off — scroll to top on navigation
}

/**
 * Set the "remember scroll position" preference for a dashboard path.
 */
export function setRememberPosition(path: string, enabled: boolean): void {
  try {
    const stored = localStorage.getItem(REMEMBER_POSITION_KEY);
    const prefs = stored ? JSON.parse(stored) : {};
    prefs[path] = enabled;
    localStorage.setItem(REMEMBER_POSITION_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore localStorage errors
  }
}
