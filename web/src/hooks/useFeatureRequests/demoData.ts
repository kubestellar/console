import type { Notification } from './types'
import { INITIAL_DEMO_NOTIFICATIONS } from './types'

let demoNotificationsState: Notification[] | null = null

export function getDemoNotifications(): Notification[] {
  if (demoNotificationsState === null) {
    demoNotificationsState = INITIAL_DEMO_NOTIFICATIONS.map(notification => ({ ...notification }))
  }
  return demoNotificationsState
}

// @ts-expect-error Reserved for future use
export function __updateDemoNotifications(updater: (prev: Notification[]) => Notification[]): Notification[] {
  demoNotificationsState = updater(getDemoNotifications())
  return demoNotificationsState
}

export function __resetDemoNotificationsForTests(): void {
  demoNotificationsState = null
}
