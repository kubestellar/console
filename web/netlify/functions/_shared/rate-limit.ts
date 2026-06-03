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

const MIN_RETRY_AFTER_SECONDS = 1;
const BLOB_STRONG_CONSISTENCY = "strong";

function retryAfterSeconds(windowStartedAt: number, windowMs: number): number {
  return Math.max(MIN_RETRY_AFTER_SECONDS, Math.ceil((windowStartedAt + windowMs - Date.now()) / 1000));
}

function isValidRecord(record: SimpleRateLimitRecord): boolean {
  return Number.isFinite(record.count) && Number.isFinite(record.windowStartedAt);
}

function limitedOnConflict(
  windowStartedAt: number | null,
  windowMs: number,
): SimpleRateLimitResult {
  return {
    limited: true,
    retryAfterSeconds: windowStartedAt === null
      ? MIN_RETRY_AFTER_SECONDS
      : retryAfterSeconds(windowStartedAt, windowMs),
  };
}

function isConditionalWriteConflict(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const maybeError = error as {
    cause?: unknown;
    status?: number;
    statusCode?: number;
  };

  if (
    maybeError.status === 409
    || maybeError.status === 412
    || maybeError.statusCode === 409
    || maybeError.statusCode === 412
  ) {
    return true;
  }

  return isConditionalWriteConflict(maybeError.cause);
}

async function writeRateLimitRecord(
  store: ReturnType<typeof getStore>,
  key: string,
  record: SimpleRateLimitRecord,
  etag?: string,
): Promise<boolean> {
  try {
    const result = await store.set(
      key,
      JSON.stringify(record),
      etag ? { onlyIfMatch: etag } : { onlyIfNew: true },
    );
    return result.modified;
  } catch (error) {
    if (isConditionalWriteConflict(error)) {
      return false;
    }

    throw error;
  }
}

export async function enforceSimpleRateLimit(
  options: SimpleRateLimitOptions,
): Promise<SimpleRateLimitResult> {
  const store = getStore(options.storeName);
  const key = `${options.prefix}${encodeURIComponent(options.subject || "unknown")}`;
  const now = Date.now();
  const initialRecord: SimpleRateLimitRecord = {
    count: 1,
    windowStartedAt: now,
  };

  let nextRecord = initialRecord;
  let expectedEtag: string | undefined;
  let conflictWindowStartedAt: number | null = null;

  try {
    const blob = await store.getWithMetadata(key, {
      consistency: BLOB_STRONG_CONSISTENCY,
      type: "text",
    });

    if (blob) {
      expectedEtag = blob.etag;

      if (blob.data) {
        try {
          const record = JSON.parse(blob.data) as SimpleRateLimitRecord;
          const inWindow = isValidRecord(record) && now - record.windowStartedAt < options.windowMs;

          if (inWindow) {
            if (record.count >= options.maxRequests) {
              return {
                limited: true,
                retryAfterSeconds: retryAfterSeconds(record.windowStartedAt, options.windowMs),
              };
            }

            nextRecord = {
              count: record.count + 1,
              windowStartedAt: record.windowStartedAt,
            };
            conflictWindowStartedAt = record.windowStartedAt;
          }
        } catch {
          // Reset malformed entries below using the last seen ETag.
        }
      }
    }
  } catch {
    expectedEtag = undefined;
  }

  const modified = await writeRateLimitRecord(store, key, nextRecord, expectedEtag);
  if (!modified) {
    return limitedOnConflict(conflictWindowStartedAt, options.windowMs);
  }

  return { limited: false, retryAfterSeconds: 0 };
}
