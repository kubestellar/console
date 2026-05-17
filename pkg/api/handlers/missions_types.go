package handlers

import (
	"encoding/json"
	"net/http"
	"sync"
	"time"

	"github.com/kubestellar/console/pkg/store"
)

const (
	missionsAPITimeout   = 30 * time.Second
	missionsMaxBodyBytes = 10 * 1024 * 1024 // 10MB
	missionsMaxPathLen   = 512              // max length for path/ref parameters

	// missionsGitHubShareMaxBytes bounds the JSON payload accepted by
	// ShareToGitHub. The GitHub Contents API accepts base64 file content;
	// anything larger than ~1 MiB of encoded content is almost certainly
	// abusive (we are sharing kc-mission JSON docs, not binaries). Reject
	// oversize payloads with 413 instead of buffering up to
	// missionsMaxBodyBytes and holding an http client goroutine for 30s
	// (see #6419).
	missionsGitHubShareMaxBytes = 1 * 1024 * 1024 // 1 MiB

	// forkHeadSHAMaxRetries bounds how many times we poll for the fork's HEAD
	// SHA after fork creation, since GitHub may not have the ref ready
	// immediately. The retry budget below is deliberately tight — the handler
	// is synchronous and must not hold a goroutine for longer than a user is
	// willing to wait on an HTTP request (see #6420). With an initial backoff
	// of 1s and a 1.5x multiplier, 5 attempts fit inside ~10s wall time
	// (1 + 1.5 + 2.25 + 3.375 ~= 8.1s of sleep). A true fix would make the
	// fork flow asynchronous (202 Accepted + poll endpoint), but that
	// requires frontend changes tracked separately.
	forkHeadSHAMaxRetries = 5
	// forkHeadSHAInitialBackoff is the initial delay before the first retry
	// when polling for the fork's HEAD SHA.
	forkHeadSHAInitialBackoff = 1 * time.Second
	// forkHeadSHABackoffMultiplier is the factor by which the backoff delay
	// increases on each retry attempt. Uses a float multiplier so the total
	// wait time stays bounded under ~10s (#6420).
	forkHeadSHABackoffMultiplier = 1.5

	// missionsCacheTTL is how long cached GitHub API responses are considered fresh.
	// Directory listings and file contents change infrequently (console-kb is updated
	// via PRs), so a 10-minute TTL provides a good balance between freshness and
	// reducing GitHub API calls.
	missionsCacheTTL = 10 * time.Minute

	// missionsCacheStaleTTL is how long stale cache entries can be served when
	// GitHub returns a rate-limit error (403/429). This prevents complete outages
	// when the unauthenticated rate limit (60 req/hr) is exhausted.
	missionsCacheStaleTTL = 1 * time.Hour

	// missionsMaxFetchRetries is the number of retry attempts for transient
	// upstream errors (5xx, network timeouts) before falling back to stale
	// cache or returning 502. Retries use exponential backoff starting at
	// missionsFetchRetryBaseDelay. (#10966)
	missionsMaxFetchRetries     = 2
	missionsFetchRetryBaseDelay = 500 * time.Millisecond

	// missionsCacheMaxEntries is the maximum number of entries in the response cache.
	// Each entry stores a directory listing or file body.
	missionsCacheMaxEntries = 256

	// missionsValidateMaxBytes is a tighter payload cap for ValidateMission.
	// Mission JSON documents are small structured metadata — legitimate payloads
	// are well under 1 MiB. Accepting the full missionsMaxBodyBytes (10 MiB) for
	// json.Unmarshal invites deeply-nested payloads that stress the decoder.
	// Reject oversize validate requests early with 413 (#6820).
	missionsValidateMaxBytes = 1 * 1024 * 1024 // 1 MiB

	// slackMaxTextBytes is the maximum allowed size for the Text field in a
	// SlackShareRequest. Slack messages are typically short; 10 KB is more
	// than enough for any legitimate use. Without this cap a caller could
	// POST up to missionsMaxBodyBytes (10 MiB) of text that gets forwarded
	// to Slack, buffering the full payload in-process (#6817).
	slackMaxTextBytes = 10 * 1024 // 10 KB

	// missionsCacheMaxBytes bounds the TOTAL byte size of all cache entries,
	// not just the entry count. Without this bound an attacker could fill
	// missionsCacheMaxEntries slots with ~10 MiB file bodies each (the
	// per-request missionsMaxBodyBytes cap), pushing ~2.5 GiB into resident
	// memory (#6417). 256 MiB is a reasonable ceiling: large enough to hold
	// the entire kubestellar/console-kb repo (~tens of MiB) with headroom,
	// small enough that a single process footprint stays predictable.
	missionsCacheMaxBytes = 256 * 1024 * 1024 // 256 MiB
)

// allowedShareRepoEnvVar is the environment variable name operators use to
// extend the built-in share-repo allowlist at runtime without a code change.
const allowedShareRepoEnvVar = "KC_ALLOWED_SHARE_REPOS"

// Pagination defaults for GET /api/missions/scores
const defaultScoresPageLimit = 50
const maxScoresPageLimit = 200

// missionsCacheEntry holds a cached GitHub API response (directory listing or file content).
type missionsCacheEntry struct {
	body        []byte
	contentType string
	statusCode  int
	fetchedAt   time.Time
}

// missionsResponseCache is a concurrency-safe in-memory cache for GitHub API responses.
// The cache key is the full request URL. Entries are evicted (oldest-first) when
// either the entry count exceeds missionsCacheMaxEntries or the total byte size
// exceeds missionsCacheMaxBytes (#6417).
// #6841 — insertOrder tracks keys in insertion order for O(1) oldest-key lookup
// during eviction, replacing the previous O(n) map scan.
type missionsResponseCache struct {
	mu          sync.RWMutex
	entries     map[string]*missionsCacheEntry
	insertOrder []string
	totalBytes  int
}

// kbGapsDefaultLimit is the default number of gap entries returned by GetKBGaps.
const kbGapsDefaultLimit = 20

// MissionsHandler handles mission-related API endpoints (knowledge base browsing,
// validation, sharing).
type MissionsHandler struct {
	httpClient   *http.Client
	githubAPIURL string // defaults to "https://api.github.com"
	githubRawURL string // defaults to "https://raw.githubusercontent.com"
	cache        *missionsResponseCache
	store        store.Store // optional; nil disables gap tracking
}

// cacheStatus indicates whether a fetchWithCache result came from a fresh cache
// hit, a network fetch (cache miss), or a stale entry served during upstream errors.
type cacheStatus string

const (
	cacheStatusHit   cacheStatus = "HIT"
	cacheStatusMiss  cacheStatus = "MISS"
	cacheStatusStale cacheStatus = "STALE"
)

// fetchWithCache encapsulates the common fetch-with-cache pattern used by GitHub wrappers.
// It checks fresh cache, calls githubGet, drains/limits the body, and falls back to stale cache on upstream/rate-limit errors.
// It does NOT store the final response in fresh cache (callers must do this to support transforming before caching).
type githubFetchResult struct {
	Body        []byte
	StatusCode  int
	ContentType string
	CacheStatus cacheStatus
}

// MissionSpec is the minimal structure for a kc-mission-v1 document.
type MissionSpec struct {
	APIVersion string `json:"apiVersion"`
	Kind       string `json:"kind"`
	Metadata   struct {
		Name string `json:"name"`
	} `json:"metadata"`
	Spec struct {
		Description string `json:"description"`
	} `json:"spec"`
}

type validateMissionRequest struct {
	Mission json.RawMessage `json:"mission"`
	Path    string          `json:"path"`
}

type indexJsonFormat struct {
	Version  int `json:"version"`
	Count    int `json:"count"`
	Missions []struct {
		Path               string      `json:"path"`
		Title              string      `json:"title"`
		Description        string      `json:"description"`
		QualityScore       *int        `json:"qualityScore"`
		QualityPass        *bool       `json:"qualityPass"`
		TestedOn           interface{} `json:"testedOn"`
		QualityIssues      []string    `json:"qualityIssues"`
		QualitySuggestions []string    `json:"qualitySuggestions"`
		QualityBreakdown   interface{} `json:"qualityBreakdown"`
		CncfProjects       []string    `json:"cncfProjects"`
	} `json:"missions"`
}

// SlackShareRequest is the payload for sharing a mission to Slack.
type SlackShareRequest struct {
	WebhookURL string `json:"webhookUrl"`
	Text       string `json:"text"`
}

// validSlackWebhookHost is the ONLY host a Slack incoming webhook URL may
// point at. Any other host is a potential SSRF target (see #6416).
const validSlackWebhookHost = "hooks.slack.com"

// validSlackWebhookPathPrefix is the required path prefix for a real Slack
// incoming webhook — anything else is either a misconfiguration or an
// attempt to proxy the request elsewhere.
const validSlackWebhookPathPrefix = "/services/"

// GitHubShareRequest is the payload for sharing a mission to GitHub as a PR.
type GitHubShareRequest struct {
	Repo     string `json:"repo"`     // e.g. "kubestellar/console"
	FilePath string `json:"filePath"` // path in repo
	Content  string `json:"content"`  // file content (base64)
	Message  string `json:"message"`  // commit message
	Branch   string `json:"branch"`   // new branch name
}
