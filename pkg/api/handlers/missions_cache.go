package handlers

import (
	"fmt"
	"net/url"
	"path"
	"strings"
	"time"
)

// get returns a cached entry if it exists and is within the given TTL.
// Returns nil if no entry exists or the entry is expired.
//
// #6822 — Returns a shallow copy of the entry so callers cannot mutate
// the shared cache data after the read lock is released.
func (c *missionsResponseCache) get(key string, ttl time.Duration) *missionsCacheEntry {
	c.mu.RLock()
	defer c.mu.RUnlock()
	entry, ok := c.entries[key]
	if !ok {
		return nil
	}
	if time.Since(entry.fetchedAt) > ttl {
		return nil
	}
	cp := *entry
	return &cp
}

// getStale returns a cached entry even if expired, as long as it is within staleTTL.
// Used to serve stale data when GitHub rate-limits us — better than an error.
//
// #6822 — Returns a shallow copy (same rationale as get).
func (c *missionsResponseCache) getStale(key string, staleTTL time.Duration) *missionsCacheEntry {
	c.mu.RLock()
	defer c.mu.RUnlock()
	entry, ok := c.entries[key]
	if !ok {
		return nil
	}
	if time.Since(entry.fetchedAt) > staleTTL {
		return nil
	}
	cp := *entry
	return &cp
}

// evictOldestLocked removes the single oldest entry from the cache.
// Returns true if an entry was evicted.
//
// REQUIRES: c.mu held in WRITE mode by the caller (#6821).
//
// Currently called only from set(), which acquires c.mu.Lock() before
// invoking this method. Any new call-site MUST hold the write lock —
// this function reads and modifies c.entries, c.insertOrder, and
// c.totalBytes without further synchronisation.
//
// #6841 — Uses the insertOrder slice for O(1) oldest-key lookup instead of
// scanning the entire map on every eviction.
func (c *missionsResponseCache) evictOldestLocked() bool {
	for len(c.insertOrder) > 0 {
		oldestKey := c.insertOrder[0]
		c.insertOrder = c.insertOrder[1:]
		if prev, ok := c.entries[oldestKey]; ok {
			c.totalBytes -= len(prev.body)
			delete(c.entries, oldestKey)
			return true
		}
		// Key was already deleted (e.g. overwritten by set); skip to next.
	}
	return false
}

// set stores a response in the cache, evicting older entries until both the
// entry-count cap (missionsCacheMaxEntries) and the byte-size cap
// (missionsCacheMaxBytes) are satisfied (#6417). A single entry larger than
// the byte cap is rejected rather than evicting the entire cache to make room.
func (c *missionsResponseCache) set(key string, entry *missionsCacheEntry) {
	entrySize := len(entry.body)
	// Reject pathological single entries that would blow the byte cap on their own.
	if entrySize > missionsCacheMaxBytes {
		return
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	// If the key already exists, account for its old size before replacing.
	// Note: we do NOT remove from insertOrder here; evictOldestLocked skips
	// stale entries that are no longer in the map.
	if prev, ok := c.entries[key]; ok {
		c.totalBytes -= len(prev.body)
		delete(c.entries, key)
	}
	// Evict oldest entries until both caps will be satisfied after insertion.
	// #7132 — Guard against infinite loops: if len(entries)==0 but totalBytes
	// somehow remains above the threshold (e.g. all 0-byte payloads), break
	// immediately instead of spinning on an empty map.
	for len(c.entries) >= missionsCacheMaxEntries || c.totalBytes+entrySize > missionsCacheMaxBytes {
		if len(c.entries) == 0 {
			// Nothing left to evict — reset totalBytes as a safety net.
			c.totalBytes = 0
			break
		}
		if !c.evictOldestLocked() {
			break
		}
	}
	c.entries[key] = entry
	c.insertOrder = append(c.insertOrder, key)
	c.totalBytes += entrySize
}

// sanitizePath validates and sanitizes a file path parameter.
//
// SECURITY (#6418): The naive version of this function used
// `strings.Contains(rawPath, "..")` to block traversal, but Fiber's c.Query
// URL-decodes exactly once. An attacker sending %252e%252e%252f gets one
// decode from Fiber down to %2e%2e%2f, which does NOT contain the literal
// string ".." and so bypassed the check. The raw string was then forwarded
// into a fmt.Sprintf'd GitHub URL where a downstream consumer could decode
// it a second time into ../ and escape the /missions/ base directory.
//
// The hardened version URL-decodes the input one extra time (matching the
// worst-case double-decoding downstream), runs path.Clean on it, and
// rejects any result that still contains a traversal component.
func sanitizePath(raw string) (string, error) {
	if len(raw) > missionsMaxPathLen {
		return "", fmt.Errorf("path exceeds maximum length of %d", missionsMaxPathLen)
	}
	// Decode repeatedly until the string stops changing. Fiber's c.Query
	// has already decoded once before we see the value; an attacker who
	// knows this can defeat a naive single-pass check by double- or
	// triple-encoding (%252e → %2e → .). Iterating until a fixed point
	// catches arbitrary nesting. Bound the iteration count so a
	// pathological input cannot spin forever.
	const maxDecodeIterations = 5
	decoded := raw
	for i := 0; i < maxDecodeIterations; i++ {
		next, err := url.QueryUnescape(decoded)
		if err != nil {
			return "", fmt.Errorf("invalid path encoding")
		}
		if next == decoded {
			break
		}
		decoded = next
	}
	// If the input required the maximum number of decode passes and is
	// still changing, it's pathologically nested — reject outright.
	if next, err := url.QueryUnescape(decoded); err == nil && next != decoded {
		return "", fmt.Errorf("invalid path encoding")
	}
	// Normalize forward and backslash variants — Windows-style separators
	// should never appear in a GitHub content path, but decoded %5c would
	// produce them and some downstream callers treat them as separators.
	if strings.ContainsAny(decoded, "\\") {
		return "", fmt.Errorf("path contains invalid character")
	}
	// Block null bytes
	if strings.ContainsRune(decoded, 0) {
		return "", fmt.Errorf("path contains null bytes")
	}
	// Block shell metacharacters and control characters
	for _, ch := range decoded {
		if ch < 0x20 || ch == '`' || ch == '$' || ch == '|' || ch == ';' || ch == '&' {
			return "", fmt.Errorf("path contains invalid character")
		}
	}
	// Detect traversal explicitly before path.Clean — path.Clean would
	// silently collapse "../etc/passwd" to "etc/passwd" and hide the
	// escape attempt from any post-clean check. Split on slash and reject
	// if any segment is exactly ".." (the only form that walks up a
	// directory in POSIX path semantics after decoding).
	for _, seg := range strings.Split(decoded, "/") {
		if seg == ".." {
			return "", fmt.Errorf("path traversal (..) is not allowed")
		}
	}
	// Belt-and-suspenders: path.Clean as a second-pass canonicalizer
	// catches adjacent-slash artifacts and leading "./". We anchor on
	// "/" so that a cleaned result of "/" maps back to the empty root.
	cleaned := path.Clean("/" + decoded)
	// After Clean, the literal ".." substring should never survive unless
	// the attacker smuggled something pathological (e.g. ".../...//").
	if strings.Contains(cleaned, "..") {
		return "", fmt.Errorf("path traversal (..) is not allowed")
	}
	// Strip the leading slash we added for path.Clean; empty path (root of
	// console-kb) is valid and maps to the repo root listing.
	result := strings.TrimPrefix(cleaned, "/")
	if result == "." {
		result = ""
	}
	return result, nil
}

// validateKBBrowsePath restricts gap-tracked browse paths to simple repository
// slugs so the public browse endpoint cannot fill the tracker with arbitrary
// strings.
func validateKBBrowsePath(path string) error {
	for _, ch := range path {
		if (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9') || ch == '/' || ch == '-' {
			continue
		}
		return fmt.Errorf("browse path contains invalid character: %c", ch)
	}
	return nil
}

// sanitizeRef validates a git ref (branch/tag) parameter.
// SECURITY: Blocks flag injection and dangerous patterns.
func sanitizeRef(ref string) (string, error) {
	if len(ref) > missionsMaxPathLen {
		return "", fmt.Errorf("ref exceeds maximum length")
	}
	if strings.HasPrefix(ref, "-") {
		return "", fmt.Errorf("ref must not start with '-'")
	}
	if strings.Contains(ref, "..") {
		return "", fmt.Errorf("ref must not contain '..'")
	}
	// Only allow alphanumeric, -, _, ., /
	for _, ch := range ref {
		if !((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') ||
			(ch >= '0' && ch <= '9') || ch == '-' || ch == '_' || ch == '.' || ch == '/') {
			return "", fmt.Errorf("ref contains invalid character: %c", ch)
		}
	}
	return ref, nil
}
