package missions

import (
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func TestMissions_CacheEviction(t *testing.T) {
	cache := &missionsResponseCache{entries: make(map[string]*missionsCacheEntry)}

	// Fill cache to capacity
	for i := 0; i < missionsCacheMaxEntries; i++ {
		cache.set(
			strings.Repeat("k", i+1), // unique keys
			&missionsCacheEntry{
				body:      []byte("test"),
				fetchedAt: time.Now().Add(time.Duration(i) * time.Second),
			},
		)
	}
	assert.Len(t, cache.entries, missionsCacheMaxEntries)

	// Adding one more should evict the oldest (key "k")
	cache.set("new-key", &missionsCacheEntry{
		body:      []byte("new"),
		fetchedAt: time.Now(),
	})
	assert.Len(t, cache.entries, missionsCacheMaxEntries, "cache should not exceed max entries")

	// The oldest entry (key "k") should be evicted
	assert.Nil(t, cache.get("k", time.Hour), "oldest entry should have been evicted")
	assert.NotNil(t, cache.get("new-key", time.Hour), "newest entry should exist")
}

// ---------- Security regression tests ----------

// TestSanitizePath_DoubleEncodedTraversal covers the #6418 regression:
// Fiber's c.Query decodes once, so a payload of %252e%252e%252f arrives at
// sanitizePath as the literal string "%2e%2e%2f". The pre-fix implementation
// used strings.Contains(rawPath, "..") and missed this because the literal
// ".." characters aren't present until a second decode happens.

func TestMissionsCache_ByteCap(t *testing.T) {
	cache := &missionsResponseCache{entries: make(map[string]*missionsCacheEntry)}

	// entrySize chosen so that ~10 entries would blow the 256 MiB cap.
	// 30 MiB each * 10 = 300 MiB > 256 MiB cap.
	const entrySize = 30 * 1024 * 1024
	const numEntries = 10
	body := make([]byte, entrySize)

	for i := 0; i < numEntries; i++ {
		cache.set(
			// deterministic unique keys
			"k-"+string(rune('a'+i)),
			&missionsCacheEntry{
				body:      body,
				fetchedAt: time.Now().Add(time.Duration(i) * time.Second),
			},
		)
	}

	// totalBytes must not exceed the cap.
	assert.LessOrEqual(t, cache.totalBytes, missionsCacheMaxBytes,
		"cache totalBytes should respect missionsCacheMaxBytes")

	// At entrySize=30 MiB and cap=256 MiB, at most 8 entries can fit
	// (8 * 30 = 240). The earliest entries should have been evicted.
	maxFit := missionsCacheMaxBytes / entrySize
	assert.LessOrEqual(t, len(cache.entries), maxFit,
		"cache should have evicted down to what fits in the byte cap")
	assert.NotNil(t, cache.get("k-"+string(rune('a'+numEntries-1)), time.Hour),
		"newest entry should survive byte-cap eviction")
	assert.Nil(t, cache.get("k-a", time.Hour),
		"oldest entry should have been evicted by byte cap")
}

// TestMissionsCache_ByteCapRejectsOversizeEntry ensures a single entry
// larger than the whole cap is rejected rather than evicting everything.

func TestMissionsCache_ByteCapRejectsOversizeEntry(t *testing.T) {
	cache := &missionsResponseCache{entries: make(map[string]*missionsCacheEntry)}
	cache.set("small", &missionsCacheEntry{body: []byte("abc"), fetchedAt: time.Now()})

	huge := make([]byte, missionsCacheMaxBytes+1)
	cache.set("huge", &missionsCacheEntry{body: huge, fetchedAt: time.Now()})

	assert.NotNil(t, cache.get("small", time.Hour), "small entry should survive")
	assert.Nil(t, cache.get("huge", time.Hour), "oversize entry should be rejected")
}

// ---------- GetKBScores ----------

// indexWithScores is a minimal fixes/index.json payload used by the score tests.
const indexWithScores = `{
	"version": 1,
	"count": 2,
	"missions": [
		{
			"path": "fixes/cncf-generated/coredns/coredns-123.json",
			"title": "CoreDNS Issue 123",
			"qualityScore": 82,
			"qualityPass": true,
			"qualityIssues": [],
			"qualitySuggestions": ["Add more examples"],
			"qualityBreakdown": {"structure": 90, "completeness": 74},
			"cncfProjects": ["coredns"]
		},
		{
			"path": "fixes/cncf-generated/kubernetes/kubernetes-456.json",
			"title": "Kubernetes Issue 456",
			"cncfProjects": ["kubernetes"]
		}
	]
}`
