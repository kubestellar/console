import { ROUTES } from '../../config/routes'

export const STELLAR_NAVIGATION_EVENT = 'stellar:navigate'

export const STELLAR_SECTION_ID = {
  OVERVIEW: 'stellar-overview',
  ACTIVITY: 'stellar-activity',
  EVENTS: 'stellar-events',
  CHAT: 'stellar-chat',
} as const

export type StellarSectionId = (typeof STELLAR_SECTION_ID)[keyof typeof STELLAR_SECTION_ID]

type StellarRailKey = 'overview' | 'activity' | 'events' | 'chat' | 'audit'

export interface StellarRailItem {
  key: StellarRailKey
  label: string
  glyph: string
  href: string
  route: string
  sectionId?: StellarSectionId
}

export const STELLAR_NAV_HREF = {
  OVERVIEW: ROUTES.STELLAR,
  ACTIVITY: `${ROUTES.STELLAR}#${STELLAR_SECTION_ID.ACTIVITY}`,
  EVENTS: `${ROUTES.STELLAR}#${STELLAR_SECTION_ID.EVENTS}`,
  CHAT: `${ROUTES.STELLAR}#${STELLAR_SECTION_ID.CHAT}`,
  AUDIT: ROUTES.STELLAR_AUDIT,
} as const

export const STELLAR_RAIL_ITEMS: readonly StellarRailItem[] = [
  {
    key: 'overview',
    label: 'Open Stellar overview',
    glyph: '✦',
    href: STELLAR_NAV_HREF.OVERVIEW,
    route: ROUTES.STELLAR,
    sectionId: STELLAR_SECTION_ID.OVERVIEW,
  },
  {
    key: 'activity',
    label: 'Open Stellar activity log',
    glyph: 'L',
    href: STELLAR_NAV_HREF.ACTIVITY,
    route: ROUTES.STELLAR,
    sectionId: STELLAR_SECTION_ID.ACTIVITY,
  },
  {
    key: 'events',
    label: 'Open Stellar events',
    glyph: 'E',
    href: STELLAR_NAV_HREF.EVENTS,
    route: ROUTES.STELLAR,
    sectionId: STELLAR_SECTION_ID.EVENTS,
  },
  {
    key: 'chat',
    label: 'Open Stellar chat',
    glyph: 'C',
    href: STELLAR_NAV_HREF.CHAT,
    route: ROUTES.STELLAR,
    sectionId: STELLAR_SECTION_ID.CHAT,
  },
  {
    key: 'audit',
    label: 'Open Stellar audit log',
    glyph: 'A',
    href: STELLAR_NAV_HREF.AUDIT,
    route: ROUTES.STELLAR_AUDIT,
  },
] as const

export function getStellarSectionIdFromHash(hash: string): StellarSectionId | null {
  switch (hash.replace(/^#/, '')) {
    case STELLAR_SECTION_ID.OVERVIEW:
      return STELLAR_SECTION_ID.OVERVIEW
    case STELLAR_SECTION_ID.ACTIVITY:
      return STELLAR_SECTION_ID.ACTIVITY
    case STELLAR_SECTION_ID.EVENTS:
      return STELLAR_SECTION_ID.EVENTS
    case STELLAR_SECTION_ID.CHAT:
      return STELLAR_SECTION_ID.CHAT
    default:
      return null
  }
}

export function isOnStellarRoute(pathname: string): boolean {
  return pathname === ROUTES.STELLAR || pathname === ROUTES.STELLAR_AUDIT
}

export function isStellarRailItemActive(item: StellarRailItem, pathname: string, hash: string): boolean {
  if (pathname !== item.route) {
    return false
  }

  if (!item.sectionId) {
    return true
  }

  const currentSection = getStellarSectionIdFromHash(hash)
  if (item.sectionId === STELLAR_SECTION_ID.OVERVIEW) {
    return currentSection === null || currentSection === STELLAR_SECTION_ID.OVERVIEW
  }

  return currentSection === item.sectionId
}
