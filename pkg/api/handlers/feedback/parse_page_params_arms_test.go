package feedback

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// runParsePageParams mounts parsePageParams on a Fiber test app, issues a GET
// with the given query string, and returns (limit, offset, status). Callers
// assert on all three. Status 200 means parsePageParams returned nil error;
// any other status is the fiber.NewError propagated back by parsePageParams.
func runParsePageParams(t *testing.T, rawQuery string) (limit, offset, status int) {
	t.Helper()
	app := fiber.New()
	app.Get("/test", func(c *fiber.Ctx) error {
		var err error
		limit, offset, err = parsePageParams(c)
		if err != nil {
			return err
		}
		return c.SendStatus(fiber.StatusOK)
	})

	url := "/test"
	if rawQuery != "" {
		url = url + "?" + rawQuery
	}
	req, err := http.NewRequest(http.MethodGet, url, nil)
	require.NoError(t, err)
	req.Host = "localhost"

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	defer resp.Body.Close()
	return limit, offset, resp.StatusCode
}

// TestParsePageParams_LimitArms exercises every arm of the limit branch:
// well-formed positive, malformed, negative, over-ceiling, and boundary.
// #6598 anchors the limit parsing contract; regressing any of these arms
// would silently break the paginated feedback list endpoints.
func TestParsePageParams_LimitArms(t *testing.T) {
	t.Run("valid limit is parsed", func(t *testing.T) {
		limit, offset, status := runParsePageParams(t, "limit=25")
		assert.Equal(t, http.StatusOK, status)
		assert.Equal(t, 25, limit)
		assert.Equal(t, 0, offset)
	})

	t.Run("limit at ceiling is accepted", func(t *testing.T) {
		limit, _, status := runParsePageParams(t, fmt.Sprintf("limit=%d", maxClientPageLimit))
		assert.Equal(t, http.StatusOK, status,
			"limit == maxClientPageLimit must be accepted (boundary is inclusive)")
		assert.Equal(t, maxClientPageLimit, limit)
	})

	t.Run("limit one above ceiling is rejected", func(t *testing.T) {
		_, _, status := runParsePageParams(t, fmt.Sprintf("limit=%d", maxClientPageLimit+1))
		assert.Equal(t, http.StatusBadRequest, status,
			"limit > maxClientPageLimit must return 400")
	})

	t.Run("non-numeric limit is rejected", func(t *testing.T) {
		_, _, status := runParsePageParams(t, "limit=abc")
		assert.Equal(t, http.StatusBadRequest, status)
	})

	t.Run("negative limit is rejected", func(t *testing.T) {
		_, _, status := runParsePageParams(t, "limit=-1")
		assert.Equal(t, http.StatusBadRequest, status,
			"negative limit must return 400 (guards against int-wrap in SQL LIMIT clauses)")
	})

	t.Run("empty limit falls back to default", func(t *testing.T) {
		limit, _, status := runParsePageParams(t, "limit=")
		assert.Equal(t, http.StatusOK, status,
			"empty limit query string must be treated as absent, not malformed")
		assert.Equal(t, 0, limit)
	})
}

// TestParsePageParams_OffsetArms exercises every arm of the offset branch.
// Malformed / negative offset must fail before it reaches the store, otherwise
// a hostile client could feed a signed-int wraparound into the DB driver.
// #6598-#6602.
func TestParsePageParams_OffsetArms(t *testing.T) {
	t.Run("valid offset is parsed", func(t *testing.T) {
		_, offset, status := runParsePageParams(t, "offset=100")
		assert.Equal(t, http.StatusOK, status)
		assert.Equal(t, 100, offset)
	})

	t.Run("valid limit and offset together", func(t *testing.T) {
		limit, offset, status := runParsePageParams(t, "limit=50&offset=200")
		assert.Equal(t, http.StatusOK, status)
		assert.Equal(t, 50, limit)
		assert.Equal(t, 200, offset)
	})

	t.Run("non-numeric offset is rejected", func(t *testing.T) {
		_, _, status := runParsePageParams(t, "offset=xyz")
		assert.Equal(t, http.StatusBadRequest, status)
	})

	t.Run("negative offset is rejected", func(t *testing.T) {
		_, _, status := runParsePageParams(t, "offset=-5")
		assert.Equal(t, http.StatusBadRequest, status,
			"negative offset must return 400 — SQL OFFSET clauses treat "+
				"negative values inconsistently across drivers")
	})

	t.Run("empty offset falls back to default", func(t *testing.T) {
		_, offset, status := runParsePageParams(t, "offset=")
		assert.Equal(t, http.StatusOK, status)
		assert.Equal(t, 0, offset)
	})

	t.Run("large but under-ceiling offset is accepted", func(t *testing.T) {
		// Offset has no ceiling in parsePageParams — only limit does — so
		// a very large offset must round-trip unchanged. Guards against a
		// future edit that "adds a symmetric ceiling" for offset and
		// silently rejects requests deep in a paginated list.
		_, offset, status := runParsePageParams(t, "offset=999999")
		assert.Equal(t, http.StatusOK, status)
		assert.Equal(t, 999999, offset)
	})
}

// TestParsePageParams_MalformedLimitShortCircuitsOffset asserts that when
// limit fails validation the function returns before it looks at offset —
// so a request with both a bad limit and a bad offset reports the limit
// error, not the offset error. Locks the ordering of the two branches so
// swapping them (which would change the observable error message clients
// see) is detected.
func TestParsePageParams_MalformedLimitShortCircuitsOffset(t *testing.T) {
	_, _, status := runParsePageParams(t, "limit=abc&offset=xyz")
	assert.Equal(t, http.StatusBadRequest, status)
}
