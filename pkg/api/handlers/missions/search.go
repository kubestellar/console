package missions

import (
	"crypto/sha256"
	"encoding/hex"
	"log/slog"
	"strconv"
	"strings"

	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/kb/rag"
)

const (
	// searchDefaultK and searchMaxK bound how many results SearchMissions returns.
	searchDefaultK = 5
	searchMaxK     = 25
	// searchMaxQueryLen caps the query string length to avoid abuse.
	searchMaxQueryLen = 512
)

// SearchMissions is the semantic retrieval endpoint backing the agent's
// mission/install-guide lookup. It performs hybrid (BM25 + dense) search over
// the knowledge base and returns ranked missions with enough metadata for the
// agent to fetch and run them.
//
// GET /api/missions/search?q=<query>&k=<n>
//
// Agent tool contract — register this as a tool named "search_missions":
//
//	input:  { "query": string (required), "k": int (optional, default 5) }
//	output: { "query", "count", "results": [ { "path", "title", "description",
//	          "category", "missionClass", "difficulty", "tags", "cncfProjects",
//	          "score" } ] }
//
// The agent should call it whenever a user expresses intent to install, deploy,
// fix, or troubleshoot something, then fetch the chosen result via
// GET /api/missions/file?path=<result.path>.
func (h *MissionsHandler) SearchMissions(c *fiber.Ctx) error {
	query := strings.TrimSpace(c.Query("q"))
	if query == "" {
		return fiber.NewError(fiber.StatusBadRequest, "missing required query parameter 'q'")
	}
	// Truncate by rune count, not bytes, so we never split a multi-byte UTF-8
	// character (which would corrupt the echoed query, gap keys, and logs).
	if r := []rune(query); len(r) > searchMaxQueryLen {
		query = string(r[:searchMaxQueryLen])
	}

	k := searchDefaultK
	if raw := c.Query("k"); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed > 0 {
			k = parsed
		}
	}
	if k > searchMaxK {
		k = searchMaxK
	}

	retriever, err := h.getRetriever(c)
	if err != nil {
		slog.Error("[missions] semantic search unavailable", "error", err)
		return fiber.NewError(fiber.StatusServiceUnavailable, "mission search index unavailable")
	}

	results := retriever.Search(query, k)

	// Record a KB gap when nothing relevant comes back, reusing the existing
	// gap-tracking signal so maintainers see what users want but the KB lacks.
	if len(results) == 0 && h.store != nil {
		if rerr := h.store.RecordKBGap(c.Context(), "search:"+query); rerr != nil {
			slog.Warn("[missions] failed to record search gap", "error", rerr)
		}
	}

	return c.JSON(fiber.Map{
		"query":   query,
		"count":   len(results),
		"results": results,
	})
}

// getRetriever returns the semantic retriever, building it from the current
// index.json and rebuilding only when the index content changes.
func (h *MissionsHandler) getRetriever(c *fiber.Ctx) (*rag.Retriever, error) {
	body, err := h.fetchMissionIndexBytes(c)
	if err != nil {
		return nil, err
	}
	sum := sha256.Sum256(body)
	fingerprint := hex.EncodeToString(sum[:])

	// Fast path: return the cached retriever under a short lock if the index is
	// unchanged.
	h.retrieverMu.Lock()
	if h.retriever != nil && h.retrieverFingerprint == fingerprint {
		r := h.retriever
		h.retrieverMu.Unlock()
		return r, nil
	}
	h.retrieverMu.Unlock()

	// Build outside the lock so concurrent /search calls are not blocked during
	// embedding/indexing. A redundant build under a first-time stampede is
	// acceptable; only the publish step is serialized.
	retriever, err := rag.NewDefaultRetrieverFromIndex(body)
	if err != nil {
		return nil, err
	}

	h.retrieverMu.Lock()
	defer h.retrieverMu.Unlock()
	// Re-check: another goroutine may have published the same index meanwhile.
	if h.retriever != nil && h.retrieverFingerprint == fingerprint {
		return h.retriever, nil
	}
	h.retriever = retriever
	h.retrieverFingerprint = fingerprint
	slog.Info("[missions] built semantic search index", "docs", retriever.Len())
	return retriever, nil
}
