// Package handlers provides HTTP handlers for the console API.
package handlers

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/settings"
)

// Badge cache configuration
const (
	badgeCacheTTL              = 1 * time.Hour
	badgeComputeTimeout        = 10 * time.Second
	badgeCacheControlMaxAge    = "public, max-age=3600, stale-while-revalidate=86400"
	badgeLevelThreshold        = 0.7
	badgeMaxLevel              = 6
	badgeCacheControlErrorSecs = "public, max-age=60, stale-while-revalidate=3600"
)

// Level color bands matching shields.io palette.
var badgeLevelColors = map[int]string{
	1: "lightgrey",
	2: "yellow",
	3: "yellowgreen",
	4: "brightgreen",
	5: "blueviolet",
	6: "blue",
}

// Level display names.
var badgeLevelNames = map[int]string{
	1: "Assisted",
	2: "Instructed",
	3: "Measured",
	4: "Adaptive",
	5: "Semi-Automated",
	6: "Fully Autonomous",
}

// Scannable criterion IDs per level (L2–L6) mirroring the TS source of truth.
// L2 collapses the four instruction-file criteria into a virtual OR-group.
// Generated from web/src/lib/acmm/scannableIdsByLevel.ts — criteria with
// scannable===false are excluded.
var badgeScannableIDsByLevel = map[int][]string{
	2: {
		"acmm:agent-instructions", // virtual OR-group
		"acmm:prompts-catalog",
		"acmm:editor-config",
	},
	3: {
		"acmm:pr-acceptance-metric",
		"acmm:pr-review-rubric",
		"acmm:quality-dashboard",
		"acmm:ci-matrix",
	},
	4: {
		"acmm:auto-qa-tuning",
		"acmm:nightly-compliance",
		"acmm:copilot-review-apply",
		"acmm:auto-label",
		"acmm:ai-fix-workflow",
		"acmm:tier-classifier",
		"acmm:security-ai-md",
	},
	5: {
		"acmm:github-actions-ai",
		"acmm:auto-qa-self-tuning",
		"acmm:public-metrics",
		"acmm:policy-as-code",
		"acmm:reflection-log",
		"acmm:audit-trail",
	},
	6: {
		"acmm:auto-issue-gen",
		"acmm:multi-agent-orchestration",
		"acmm:merge-queue",
		"acmm:strategic-dashboard",
		"acmm:risk-assessment-config",
		"acmm:observability-runbook",
	},
}

// agentInstructionFileIDs are the individual L2 instruction-file criteria
// that form the virtual "acmm:agent-instructions" OR-group.
var agentInstructionFileIDs = map[string]bool{
	"acmm:claude-md":              true,
	"acmm:copilot-instructions":   true,
	"acmm:agents-md":              true,
	"acmm:cursor-rules":           true,
}

// shieldsEndpointBadge is the shields.io endpoint JSON schema.
type shieldsEndpointBadge struct {
	SchemaVersion int    `json:"schemaVersion"`
	Label         string `json:"label"`
	Message       string `json:"message"`
	Color         string `json:"color"`
	NamedLogo     string `json:"namedLogo,omitempty"`
	CacheSeconds  int    `json:"cacheSeconds,omitempty"`
}

// badgeCacheEntry stores a cached badge response.
type badgeCacheEntry struct {
	mu         sync.Mutex
	badge      *shieldsEndpointBadge
	cachedAt   time.Time
	computing  bool
}

// badgeCache is the global in-memory cache keyed by repo slug.
var badgeCache sync.Map

// ACMMBadgeHandler handles GET /api/acmm/badge?repo=owner/name.
// It returns a shields.io endpoint-compatible JSON response with aggressive
// caching to ensure shields.io never shows "custom badge inaccessible".
func ACMMBadgeHandler(c *fiber.Ctx) error {
	repo := c.Query("repo")
	if repo == "" {
		return serveBadge(c, &shieldsEndpointBadge{
			SchemaVersion: 1,
			Label:         "ACMM",
			Message:       "missing repo param",
			Color:         "red",
			CacheSeconds:  60,
		}, badgeCacheControlErrorSecs)
	}
	if !repoSlugRE.MatchString(repo) {
		return serveBadge(c, &shieldsEndpointBadge{
			SchemaVersion: 1,
			Label:         "ACMM",
			Message:       "invalid repo",
			Color:         "red",
			CacheSeconds:  60,
		}, badgeCacheControlErrorSecs)
	}

	// Look up cache
	raw, _ := badgeCache.LoadOrStore(repo, &badgeCacheEntry{})
	entry := raw.(*badgeCacheEntry)

	entry.mu.Lock()
	cached := entry.badge
	age := time.Since(entry.cachedAt)
	stale := cached == nil || age > badgeCacheTTL
	shouldRecompute := stale && !entry.computing
	if shouldRecompute {
		entry.computing = true
	}
	entry.mu.Unlock()

	// Fast path: serve from cache if we have one (even if stale)
	if cached != nil {
		if shouldRecompute {
			go recomputeBadge(repo, entry)
		}
		return serveBadge(c, cached, badgeCacheControlMaxAge)
	}

	// Cold start: no cached value yet — compute synchronously with timeout
	if shouldRecompute {
		badge := computeBadgeSynchronous(repo)
		entry.mu.Lock()
		entry.badge = badge
		entry.cachedAt = time.Now()
		entry.computing = false
		entry.mu.Unlock()
		return serveBadge(c, badge, badgeCacheControlMaxAge)
	}

	// Another goroutine is already computing — wait briefly or return fallback
	deadline := time.After(3 * time.Second)
	ticker := time.NewTicker(50 * time.Millisecond)
	defer ticker.Stop()
	for {
		select {
		case <-deadline:
			return serveBadge(c, fallbackBadge(), badgeCacheControlErrorSecs)
		case <-ticker.C:
			entry.mu.Lock()
			b := entry.badge
			entry.mu.Unlock()
			if b != nil {
				return serveBadge(c, b, badgeCacheControlMaxAge)
			}
		}
	}
}

// serveBadge writes the badge JSON with appropriate headers.
func serveBadge(c *fiber.Ctx, badge *shieldsEndpointBadge, cacheControl string) error {
	c.Set("Cache-Control", cacheControl)
	c.Set("Access-Control-Allow-Origin", "*")
	c.Set("Content-Type", "application/json")
	return c.JSON(badge)
}

// fallbackBadge returns a non-error badge for when computation is pending.
func fallbackBadge() *shieldsEndpointBadge {
	return &shieldsEndpointBadge{
		SchemaVersion: 1,
		Label:         "ACMM",
		Message:       "computing...",
		Color:         "blue",
		CacheSeconds:  60,
	}
}

// recomputeBadge runs the scan in the background and updates the cache entry.
func recomputeBadge(repo string, entry *badgeCacheEntry) {
	badge := computeBadgeSynchronous(repo)

	entry.mu.Lock()
	entry.badge = badge
	entry.cachedAt = time.Now()
	entry.computing = false
	entry.mu.Unlock()
}

// computeBadgeSynchronous performs the full ACMM scan and computes the badge.
func computeBadgeSynchronous(repo string) *shieldsEndpointBadge {
	token := settings.ResolveGitHubTokenEnv()
	ctx, cancel := context.WithTimeout(context.Background(), badgeComputeTimeout)
	defer cancel()

	// Fetch repo tree (same logic as ACMMScanHandler)
	treePaths, err := fetchACMMTreePaths(ctx, repo, token)
	if err != nil {
		return fallbackBadge()
	}

	// Detect criteria using the same catalog as the scan endpoint
	detectedSet := make(map[string]bool)
	for _, crit := range acmmCriteria {
		if matchesPatterns(treePaths, crit.Patterns) {
			detectedSet[crit.ID] = true
		}
	}

	// Synthesise the virtual L2 OR-group
	for id := range agentInstructionFileIDs {
		if detectedSet[id] {
			detectedSet["acmm:agent-instructions"] = true
			break
		}
	}

	// Compute level using the same threshold walk as the Netlify function
	level, totalDetected, totalAcmm := computeBadgeLevel(detectedSet)
	name := badgeLevelNames[level]
	color := badgeLevelColors[level]

	return &shieldsEndpointBadge{
		SchemaVersion: 1,
		Label:         "ACMM",
		Message:       fmt.Sprintf("L%d · %s · %d/%d", level, name, totalDetected, totalAcmm),
		Color:         color,
		NamedLogo:     "github",
		CacheSeconds:  300,
	}
}

// computeBadgeLevel mirrors the Netlify function's level computation.
func computeBadgeLevel(detectedSet map[string]bool) (level, totalDetected, totalAcmm int) {
	currentLevel := 1
	stopPromotion := false

	for n := 2; n <= badgeMaxLevel; n++ {
		required := badgeScannableIDsByLevel[n]
		detected := 0
		for _, id := range required {
			if detectedSet[id] {
				detected++
			}
		}
		totalAcmm += len(required)
		totalDetected += detected

		if len(required) == 0 || stopPromotion {
			continue
		}

		var threshold float64
		if n == 2 {
			threshold = 1.0 / float64(len(required))
		} else {
			threshold = badgeLevelThreshold
		}
		ratio := float64(detected) / float64(len(required))
		if ratio >= threshold {
			currentLevel = n
		} else {
			stopPromotion = true
		}
	}

	return currentLevel, totalDetected, totalAcmm
}