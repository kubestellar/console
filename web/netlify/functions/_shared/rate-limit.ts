import { getStore } from "@netlify/blobs";

interface RateLimitBlobPage {
  blobs: Array<{
    key: string;
  }>;
}

const UNKNOWN_SUBJECT = "unknown";
const CLEANUP_BUCKET_OFFSET = 2;
const CLEANUP_DELETE_LIMIT = 25;

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

function retryAfterSeconds(windowEndsAt: number): number {
  return Math.max(1, Math.ceil((windowEndsAt - Date.now()) / 1000));
}

function getSubjectKey(subject: string): string {
  return encodeURIComponent(subject || UNKNOWN_SUBJECT);
}

function getWindowBucket(now: number, windowMs: number): number {
  return Math.floor(now / windowMs);
}

function getBucketPrefix(prefix: string, subjectKey: string, bucket: number): string {
  return `${prefix}${subjectKey}:${bucket}:`;
}

function createTokenKey(prefix: string, subjectKey: string, bucket: number, now: number): string {
  return `${getBucketPrefix(prefix, subjectKey, bucket)}${now}:${crypto.randomUUID()}`;
}

async function countBucketEntries(store: ReturnType<typeof getStore>, prefix: string, limit?: number): Promise<number> {
  let count = 0;
  const paginator = store.list({ prefix, paginate: true }) as AsyncIterable<RateLimitBlobPage>;

  for await (const page of paginator) {
    count += page.blobs.length;
    // Early exit: stop counting once we know we're over limit
    if (limit !== undefined && count >= limit) return count;
  }

  return count;
}

async function cleanupExpiredBucket(
  store: ReturnType<typeof getStore>,
  prefix: string,
): Promise<void> {
  const page = await store.list({ prefix }) as RateLimitBlobPage;
  const deletes = page.blobs
    .slice(0, CLEANUP_DELETE_LIMIT)
    .map(({ key }) => store.delete(key));

  await Promise.allSettled(deletes);
}

export async function enforceSimpleRateLimit(
  options: SimpleRateLimitOptions,
): Promise<SimpleRateLimitResult> {
  const store = getStore(options.storeName);
  const now = Date.now();
  const subjectKey = getSubjectKey(options.subject);
  const bucket = getWindowBucket(now, options.windowMs);
  const cleanupBucket = bucket - CLEANUP_BUCKET_OFFSET;

  try {
    if (cleanupBucket >= 0) {
      await cleanupExpiredBucket(store, getBucketPrefix(options.prefix, subjectKey, cleanupBucket));
    }

    // Count BEFORE write to prevent storage amplification (CWE-400)
    const currentWindowCount = await countBucketEntries(
      store,
      getBucketPrefix(options.prefix, subjectKey, bucket),
      options.maxRequests,
    );

    if (currentWindowCount >= options.maxRequests) {
      return {
        limited: true,
        retryAfterSeconds: retryAfterSeconds((bucket + 1) * options.windowMs),
      };
    }

    // Only write token after confirming under limit
    await store.set(createTokenKey(options.prefix, subjectKey, bucket, now), String(now));
  } catch {
    // Fail CLOSED on store errors — deny by default (CWE-400)
    return { limited: true, retryAfterSeconds: 60 };
  }

  return { limited: false, retryAfterSeconds: 0 };
}
