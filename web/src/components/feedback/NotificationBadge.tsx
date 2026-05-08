import { useEffect } from 'react'
import { useEscapeLayer, useModalState } from '../../lib/modals'
import { Bell, X, Check, Clock, Bug, Sparkles, GitPullRequest, Eye } from 'lucide-react'
import { StatusBadge } from '../ui/StatusBadge'
import { useNotifications, type Notification, type NotificationType } from '../../hooks/useFeatureRequests'
import { formatTimeAgo } from '../../lib/formatters'

// Get icon for notification type
function getNotificationIcon(type: NotificationType) {
  switch (type) {
    case 'issue_created':
      return <Bug className="w-4 h-4 text-blue-400" />
    case 'pr_created':
      return <GitPullRequest className="w-4 h-4 text-purple-400" />
    case 'preview_ready':
      return <Eye className="w-4 h-4 text-green-400" />
    case 'pr_merged':
      return <Check className="w-4 h-4 text-green-400" />
    case 'pr_closed':
      return <X className="w-4 h-4 text-red-400" />
    case 'feedback_received':
      return <Sparkles className="w-4 h-4 text-yellow-400" />
    default:
      return <Bell className="w-4 h-4 text-muted-foreground" />
  }
}

export function NotificationBadge() {
  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    isLoading,
  } = useNotifications()
  const { isOpen, close, toggle } = useModalState()
  const isTopEscapeLayer = useEscapeLayer(isOpen)

  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !isTopEscapeLayer()) return
      e.preventDefault()
      e.stopPropagation()
      close()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, close, isTopEscapeLayer])

  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.read) {
      await markAsRead(notification.id)
    }
  }

  const handleMarkAllRead = async () => {
    await markAllAsRead()
  }

  if (isLoading && notifications.length === 0) {
    return (
      <button
        className="relative p-2 rounded-lg text-muted-foreground"
        disabled
      >
        <Bell className="w-5 h-5" />
      </button>
    )
  }

  return (
    <div className="relative">
      {/* Badge Button */}
      <button
        onClick={toggle}
        className={`relative p-2 rounded-lg hover:bg-secondary/50 transition-colors ${
          unreadCount > 0 ? 'text-foreground' : 'text-muted-foreground'
        }`}
        title={unreadCount > 0 ? `${unreadCount} unread notifications` : 'Notifications'}
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center text-2xs font-bold text-white rounded-full bg-purple-500">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-overlay"
            onClick={close}
          />

          {/* Panel */}
          <div
            role="menu"
            aria-label="Notifications"
            className="absolute right-0 top-full mt-2 w-80 bg-background border border-border rounded-lg shadow-xl z-dropdown"
            onKeyDown={(e) => {
              if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
              e.preventDefault()
              const items = e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]')
              const idx = Array.from(items).indexOf(document.activeElement as HTMLElement)
              if (e.key === 'ArrowDown') items[Math.min(idx + 1, items.length - 1)]?.focus()
              else items[Math.max(idx - 1, 0)]?.focus()
            }}
          >
            {/* Header */}
            <div className="p-3 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-purple-400" />
                <span className="font-medium text-foreground">Notifications</span>
                {unreadCount > 0 && (
                  <StatusBadge color="purple">{unreadCount} new</StatusBadge>
                )}
              </div>
              <div className="flex items-center gap-1">
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAllRead}
                    className="p-1 rounded text-xs text-muted-foreground hover:text-foreground"
                    title="Mark all as read"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={close}
                  className="p-1 rounded hover:bg-secondary/50 text-muted-foreground"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Notifications List */}
            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground">
                  <Bell className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No notifications yet</p>
                </div>
              ) : (
                notifications.slice(0, 10).map(notification => (
                  <div
                    key={notification.id}
                    role="menuitem"
                    tabIndex={0}
                    onClick={() => handleNotificationClick(notification)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleNotificationClick(notification) } }}
                    className={`p-3 border-b border-border/50 hover:bg-secondary/30 cursor-pointer transition-colors ${
                      !notification.read ? 'bg-purple-500/5' : ''
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5">
                        {getNotificationIcon(notification.notification_type)}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-medium truncate ${
                            notification.read ? 'text-muted-foreground' : 'text-foreground'
                          }`}>
                            {notification.title}
                          </span>
                          {!notification.read && (
                            <span className="w-2 h-2 rounded-full bg-purple-500 shrink-0" />
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                          {notification.message}
                        </p>
                        <span className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                          <Clock className="w-3 h-3" />
                          {formatTimeAgo(notification.created_at)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            {notifications.length > 10 && (
              <div className="p-2 border-t border-border text-center">
                <button
                  onClick={() => {
                    close()
                    // Could navigate to full notifications page
                  }}
                  className="text-xs text-purple-400 hover:text-purple-300 transition-colors"
                >
                  View all notifications
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
