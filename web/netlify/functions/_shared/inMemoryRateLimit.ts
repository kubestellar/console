const DEFAULT_SUBJECT = "unknown";
const MAX_TRACKED_SUBJECTS = 1_000;
const MS_PER_SECOND = 1_000;

export interface InMemoryRateLimitEntry {
  count: number;
  resetAt: number;
}

export interface InMemoryRateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export function getClientIp(request: Request): string {
  return request.headers.get("x-nf-client-connection-ip")
    ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? DEFAULT_SUBJECT;
}

function pruneExpiredEntries(
  rateLimitMap: Map<string, InMemoryRateLimitEntry>,
  now: number,
): void {
  if (rateLimitMap.size < MAX_TRACKED_SUBJECTS) {
    return;
  }

  for (const [subject, entry] of rateLimitMap.entries()) {
    if (now >= entry.resetAt) {
      rateLimitMap.delete(subject);
    }
  }
}

export function checkInMemoryRateLimit(
  subject: string,
  rateLimitMap: Map<string, InMemoryRateLimitEntry>,
  maxRequests: number,
  windowMs: number,
): InMemoryRateLimitResult {
  const normalizedSubject = subject || DEFAULT_SUBJECT;
  const now = Date.now();
  pruneExpiredEntries(rateLimitMap, now);

  const entry = rateLimitMap.get(normalizedSubject);
  if (!entry || now >= entry.resetAt) {
    rateLimitMap.set(normalizedSubject, {
      count: 1,
      resetAt: now + windowMs,
    });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (entry.count >= maxRequests) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / MS_PER_SECOND)),
    };
  }

  entry.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}
