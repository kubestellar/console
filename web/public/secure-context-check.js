// Pre-flight: crypto.subtle requires a Secure Context (HTTPS or localhost).
// Show a clear message instead of a cryptic "Importing a module script failed" error.
//
// This file is loaded from index.html as an external script so that the CSP
// does not need to allow 'unsafe-inline' for script-src. See netlify.toml.
(function () {
  var isSecure =
    window.isSecureContext ||
    location.hostname === 'localhost' ||
    location.hostname === '127.0.0.1'
  if (isSecure) return

  var shell = document.getElementById('app-shell')
  if (shell) {
    shell.innerHTML =
      '<svg style="width:48px;height:48px" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="1.5">' +
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
  }
  // Prevent the module script from loading (it will fail on crypto.subtle)
  throw new Error('Insecure context — HTTPS required')
})()
