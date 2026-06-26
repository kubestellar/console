import { describe, it, expect, vi } from 'vitest';
import * as time from './time';

describe('formatRelativeTime', () => {
  it('returns just now for <1min', () => {
    const now = Date.now();
    vi.setSystemTime(now);
    expect(time.formatRelativeTime(new Date(now - 10 * 1000).toISOString())).toBe('just now');
  });
  it('returns Xm ago for <1h', () => {
    const now = Date.now();
    vi.setSystemTime(now);
    expect(time.formatRelativeTime(new Date(now - 5 * 60 * 1000).toISOString())).toBe('5m ago');
  });
  it('returns Xh ago for <1d', () => {
    const now = Date.now();
    vi.setSystemTime(now);
    expect(time.formatRelativeTime(new Date(now - 3 * 60 * 60 * 1000).toISOString())).toBe('3h ago');
  });
  it('returns Xd ago for <1y', () => {
    const now = Date.now();
    vi.setSystemTime(now);
    expect(time.formatRelativeTime(new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString())).toBe('2d ago');
  });
  it('returns Xy ago for >=1y', () => {
    const now = Date.now();
    vi.setSystemTime(now);
    expect(time.formatRelativeTime(new Date(now - 400 * 24 * 60 * 60 * 1000).toISOString())).toBe('1y ago');
  });
  it('returns empty string for invalid date', () => {
    expect(time.formatRelativeTime('not-a-date')).toBe('');
  });
});

describe('resolveStellarBatchIntervalMs', () => {
  it('returns default for invalid', () => {
    expect(time.resolveStellarBatchIntervalMs('not-a-number')).toBe(time.STELLAR_DEFAULT_BATCH_INTERVAL_MS);
  });
  it('returns value for valid', () => {
    expect(time.resolveStellarBatchIntervalMs(time.STELLAR_BATCH_INTERVAL_ONE_HOUR_MS)).toBe(time.STELLAR_BATCH_INTERVAL_ONE_HOUR_MS);
  });
});

describe('getNextBatchTime', () => {
  it('returns correct next batch time for supported intervals', () => {
    const now = Date.now();
    vi.setSystemTime(now);
    expect(time.getNextBatchTime(time.STELLAR_BATCH_INTERVAL_FIFTEEN_MINUTES_MS, now)).toBe(
      now + time.STELLAR_BATCH_INTERVAL_FIFTEEN_MINUTES_MS,
    );
  });
});

describe('getNextBatchCountdown', () => {
  it('returns seconds for <1min', () => {
    const now = Date.now();
    vi.setSystemTime(now);
    expect(time.getNextBatchCountdown(now + 10_000, now)).toBe('10s');
  });
  it('returns Xm for <1h', () => {
    const now = Date.now();
    vi.setSystemTime(now);
    expect(time.getNextBatchCountdown(now + 5 * 60_000, now)).toBe('5m');
  });
  it('returns Xh Xm for >1h', () => {
    const now = Date.now();
    vi.setSystemTime(now);
    expect(time.getNextBatchCountdown(now + 65 * 60_000, now)).toBe('1h 5m');
  });
});
