/**
 * Minimal Service Worker for handling notification clicks on macOS.
 *
 * macOS does not reliably bring the browser to the foreground when
 * Notification.onclick calls window.focus(). Service Worker notifications
 * use clients.openWindow() / clients.focus(), which have proper OS-level
 * permission to raise the browser window.
 */

 

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const url = event.notification.data?.url
  if (!url) return

  // Focus an existing console tab or open a new one
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Try to find an existing tab with the same origin
      for (const client of windowClients) {
        if (client.url.startsWith(self.location.origin)) {
          client.navigate(url)
          return client.focus()
        }
      }
      // No existing tab — open a new one
      return clients.openWindow(url)
    })
  )
})
