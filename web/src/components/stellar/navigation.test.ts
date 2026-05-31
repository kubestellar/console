import { describe, it, expect } from 'vitest';
import * as nav from './navigation';

describe('getStellarSectionIdFromHash', () => {
  it('returns correct section id', () => {
    expect(nav.getStellarSectionIdFromHash('#stellar-overview')).toBe(nav.STELLAR_SECTION_ID.OVERVIEW);
    expect(nav.getStellarSectionIdFromHash('#stellar-activity')).toBe(nav.STELLAR_SECTION_ID.ACTIVITY);
    expect(nav.getStellarSectionIdFromHash('#stellar-events')).toBe(nav.STELLAR_SECTION_ID.EVENTS);
    expect(nav.getStellarSectionIdFromHash('#stellar-chat')).toBe(nav.STELLAR_SECTION_ID.CHAT);
    expect(nav.getStellarSectionIdFromHash('#stellar-audit')).toBe(nav.STELLAR_SECTION_ID.AUDIT);
    expect(nav.getStellarSectionIdFromHash('#unknown')).toBeNull();
  });
});

describe('isOnStellarRoute', () => {
  it('returns true for stellar routes', () => {
    expect(nav.isOnStellarRoute('/stellar')).toBe(true);
    expect(nav.isOnStellarRoute('/stellar/audit')).toBe(true);
    expect(nav.isOnStellarRoute('/other')).toBe(false);
  });
});

describe('isStellarRailItemActive', () => {
  it('returns true for active item', () => {
    const item = nav.STELLAR_RAIL_ITEMS[0];
    expect(nav.isStellarRailItemActive(item, item.route, '#stellar-overview')).toBe(true);
  });
  it('returns false for inactive item', () => {
    const item = nav.STELLAR_RAIL_ITEMS[1];
    expect(nav.isStellarRailItemActive(item, '/other', '#stellar-activity')).toBe(false);
  });
});
