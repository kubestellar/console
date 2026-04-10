// Pre-flight: crypto.subtle requires a Secure Context (HTTPS or localhost).
// Show a clear message instead of a cryptic "Importing a module script failed" error.
//
// This file is loaded from index.html as an external script so that the CSP
// does not need to allow 'unsafe-inline' for script-src. See netlify.toml.
//
// Note: An uncaught exception in a classic script does NOT stop the HTML parser
// from continuing to the subsequent <script type="module"> tag. Instead of
// relying on the throw to block loading, we inject a full-screen overlay that
// covers any React content that might render underneath, AND we replace the
// #root element's content so the React app cannot hydrate a conflicting UI.
// See issue #5985 for context.
(function () {
  var isSecure =
    window.isSecureContext ||
    location.hostname === 'localhost' ||
    location.hostname === '127.0.0.1'
  if (isSecure) return

  // Z-index well above any React-rendered content.
  var OVERLAY_Z_INDEX = 2147483647

  function buildErrorHtml() {
    return (
      '<svg style="width:48px;height:48px" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="1.5" aria-hidden="true">' +
      '<path d="M12 9v4m0 4h.01M3.6 20h16.8a1 1 0 0 0 .87-1.5L12.87 3.5a1 1 0 0 0-1.74 0L2.73 18.5A1 1 0 0 0 3.6 20z"/></svg>' +
      '<p style="font-size:18px;font-weight:600;color:#f4f4f5;margin-top:16px">HTTPS Required</p>' +
      '<p style="max-width:480px;text-align:center;line-height:1.6;margin-top:8px">' +
      'KubeStellar Console requires a secure context (HTTPS) to run.<br>' +
      'You are accessing <code style="background:#27272a;padding:2px 6px;border-radius:4px">' +
      location.origin +
      '</code> over plain HTTP.</p>' +
      '<p style="max-width:480px;text-align:center;line-height:1.6;margin-top:16px;font-size:13px">' +
      '<strong style="color:#a78bfa">To fix:</strong> Access this URL with <code style="background:#27272a;padding:2px 6px;border-radius:4px">https://</code> instead, ' +
      'or use <code style="background:#27272a;padding:2px 6px;border-radius:4px">localhost</code> for local development.</p>'
    )
  }

  function injectOverlay() {
    // 1) Replace the app-shell content so the pre-React shell shows the error.
    var shell = document.getElementById('app-shell')
    if (shell) {
      shell.innerHTML = buildErrorHtml()
    }
    // 2) Replace the #root content entirely — if React has already started
    //    mounting, this wipes any partial UI before the overlay covers it.
    var root = document.getElementById('root')
    if (root) {
      root.innerHTML = ''
    }
    // 3) Inject a full-screen fixed overlay that sits above any React content
    //    that may still render after this script (module scripts continue to
    //    load even if a classic script throws).
    var overlay = document.createElement('div')
    overlay.setAttribute('role', 'alert')
    overlay.setAttribute('aria-live', 'assertive')
    overlay.id = 'secure-context-overlay'
    overlay.style.cssText =
      'position:fixed;inset:0;background:#0a0a0a;color:#a1a1aa;' +
      'display:flex;flex-direction:column;align-items:center;justify-content:center;' +
      'font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;' +
      'padding:2rem;text-align:center;z-index:' + OVERLAY_Z_INDEX + ';'
    overlay.innerHTML = buildErrorHtml()
    if (document.body) {
      document.body.appendChild(overlay)
    }
  }

  if (document.readyState === 'loading') {
    // Body may not exist yet; wait until it does to inject the overlay.
    document.addEventListener('DOMContentLoaded', injectOverlay, { once: true })
  } else {
    injectOverlay()
  }

  // We still throw so any synchronous consumers (and dev tools) see the reason
  // the app refused to boot, even though this does NOT stop the subsequent
  // module script from loading. The overlay above is what the user actually sees.
  throw new Error('Insecure context — HTTPS required')
})()
