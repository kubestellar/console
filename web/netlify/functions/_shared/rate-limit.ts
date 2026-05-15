import { getStore } from "@netlify/blobs";

interface SimpleRateLimitRecord {
  count: number;
  windowStartedAt: number;
}

export interface SimpleRateLimitOptions {
  storeName: string;
  prefix: string;
  subject: string;
  maxRequests: number;
  windowMs: number;
}

export interface SimpleRateLimitResult {
  limited: boolean;
  retryAfterSeconds: number;
}

function retryAfterSeconds(windowStartedAt: number, windowMs: number): number {
  return Math.max(1, Math.ceil((windowStartedAt + windowMs - Date.now()) / 1000));
}

export async function enforceSimpleRateLimit(
  options: SimpleRateLimitOptions,
): Promise<SimpleRateLimitResult> {
  const store = getStore(options.storeName);
  const key = `${options.prefix}${encodeURIComponent(options.subject || "unknown")}`;
  const now = Date.now();

  try {
    const raw = await store.get(key);
    if (raw) {
      const record = JSON.parse(raw) as SimpleRateLimitRecord;
      const inWindow = now - record.windowStartedAt < options.windowMs;
      if (Number.isFinite(record.count) && Number.isFinite(record.windowStartedAt) && inWindow) {
        if (record.count >= options.maxRequests) {
          return {
            limited: true,
            retryAfterSeconds: retryAfterSeconds(record.windowStartedAt, options.windowMs),
          };
        }

        await store.set(key, JSON.stringify({
          count: record.count + 1,
          windowStartedAt: record.windowStartedAt,
        } satisfies SimpleRateLimitRecord));
        return { limited: false, retryAfterSeconds: 0 };
      }
    }
  } catch {
    // Reset malformed or unreadable entries by overwriting below.
  }

  await store.set(key, JSON.stringify({
    count: 1,
    windowStartedAt: now,
  } satisfies SimpleRateLimitRecord));

  return { limited: false, retryAfterSeconds: 0 };
}
