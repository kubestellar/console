// Rotating tips for the pre-React splash page (#5984).
//
// Mirrors the watchdog loading screen tips (cmd/console/watchdog_html.go) so
// users learn about console features while the initial JS bundle loads.
// Runs before React; must be CSP-safe (no inline scripts, no eval).
//
// The element IDs and classes here are injected by web/index.html.
(function () {
  // Rotate a new tip every 8 seconds — matches the watchdog loader cadence.
  var TIP_ROTATE_MS = 8000
  // Fade-out duration must match the CSS transition on .tip-text (400ms).
  var TIP_FADE_MS = 400

  var TIPS = [
    'Press <kbd>?</kbd> anywhere in the console to see all keyboard shortcuts.',
    'Use the global cluster filter at the top to scope every card to specific clusters.',
    'Right-click any resource for quick actions like logs, exec, and YAML view.',
    'Drag cards to rearrange your dashboard. Your layout auto-saves.',
    'Use <kbd>Cmd/Ctrl+K</kbd> to open the universal search across all clusters.',
    'The Mission sidebar lets you describe what you want — the AI will figure out the kubectl.',
    'Pin frequently-used dashboards so they appear at the top of the sidebar.',
    'Custom dashboards can mix cards from different categories. Try the Customize button.',
    'The Marketplace has 60+ CNCF project cards ready to install with one click.',
    'Demo mode (toggle in Settings) lets you explore every feature without a real cluster.',
    'Cards with a yellow border are showing demo data — connect a cluster to see real data.',
    'The Compliance card runs OPA, Kyverno, and Falco checks across all your clusters.',
    'GPU dashboards show per-namespace allocations and utilization across multi-cluster fleets.',
    'Use the AI agent picker to switch between Claude, Copilot, and other agents per mission.',
    'Saved missions are stored permanently — click any to re-run or fork as a template.'
  ]

  var tipTextEl = document.getElementById('app-shell-tip-text')
  if (!tipTextEl) return

  // Respect users who prefer reduced motion — show one tip and stop.
  var prefersReducedMotion =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  var tipIdx = Math.floor(Math.random() * TIPS.length)

  function showTip() {
    if (!tipTextEl) return
    tipTextEl.style.opacity = '0'
    setTimeout(function () {
      tipTextEl.innerHTML = TIPS[tipIdx]
      tipTextEl.style.opacity = '1'
      tipIdx = (tipIdx + 1) % TIPS.length
    }, prefersReducedMotion ? 0 : TIP_FADE_MS)
  }

  showTip()
  if (!prefersReducedMotion) {
    var rotateTimer = setInterval(showTip, TIP_ROTATE_MS)
    // Stop rotating once React removes the app-shell element.
    var stopTimer = setInterval(function () {
      if (!document.getElementById('app-shell-tip-text')) {
        clearInterval(rotateTimer)
        clearInterval(stopTimer)
      }
    }, TIP_ROTATE_MS)
  }
})()
