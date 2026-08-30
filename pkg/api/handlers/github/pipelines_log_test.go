package github

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestHandleLog_* covers handleLog (pipelines.go:445), the /log endpoint that
// streams the tail of an Actions job log through the console. Coverage was
// 14.3% pre-fix (only the "missing query params" 400 branch was hit).
// Tracked in kubestellar/console#22928.
//
// Uses the same roundTripperFunc + fiber-app scaffolding as
// pipelines_health_test.go so we can intercept h.httpClient without standing
// up an httptest.Server (ghpGitHubAPIBase is a compile-time constant pointing
// at https://api.github.com, so a local server wouldn't be reached anyway).

func newLogTestApp(t *testing.T, token string, rt roundTripperFunc) *fiber.App {
	t.Helper()
	h := NewGitHubPipelinesHandler(token, nil)
	if rt != nil {
		h.httpClient = &http.Client{Transport: rt}
	}
	app := fiber.New()
	app.Get("/api/github-pipelines/log", h.handleLog)
	return app
}

func doLogRequest(t *testing.T, app *fiber.App, query string) *http.Response {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/api/github-pipelines/log"+query, nil)
	req.Host = "localhost"
	res, err := app.Test(req, -1)
	require.NoError(t, err)
	return res
}

func TestHandleLog_MissingQueryParamsReturns400(t *testing.T) {
	app := newLogTestApp(t, "tok", nil)

	for _, q := range []string{"", "?repo=kubestellar/console", "?job=42"} {
		t.Run("query="+q, func(t *testing.T) {
			res := doLogRequest(t, app, q)
			assert.Equal(t, fiber.StatusBadRequest, res.StatusCode)
			body, _ := io.ReadAll(res.Body)
			assert.Contains(t, string(body), "repo and job required")
		})
	}
}

func TestHandleLog_NonAllowlistedRepoReturns403(t *testing.T) {
	app := newLogTestApp(t, "tok", nil)
	res := doLogRequest(t, app, "?repo=evil/repo&job=42")
	assert.Equal(t, fiber.StatusForbidden, res.StatusCode)
	body, _ := io.ReadAll(res.Body)
	assert.Contains(t, string(body), ghpRepoAllowlistError)
}

func TestHandleLog_MalformedRepoReturns403(t *testing.T) {
	// Repo strings that fail ghpValidRepoPattern take the same 403 branch as
	// non-allowlisted repos — pins that the pattern guard is applied before
	// any downstream fetch, which prevents interpolation of hostile input
	// into the GitHub API path.
	app := newLogTestApp(t, "tok", nil)
	res := doLogRequest(t, app, "?repo=..%2Fescape&job=42")
	assert.Equal(t, fiber.StatusForbidden, res.StatusCode)
}

func TestHandleLog_NonNumericJobReturns400(t *testing.T) {
	app := newLogTestApp(t, "tok", nil)
	res := doLogRequest(t, app, "?repo=kubestellar/console&job=not-a-number")
	assert.Equal(t, fiber.StatusBadRequest, res.StatusCode)
	body, _ := io.ReadAll(res.Body)
	assert.Contains(t, string(body), "job must be a numeric ID")
}

func TestHandleLog_UpstreamNetworkErrorReturns502(t *testing.T) {
	rt := roundTripperFunc(func(r *http.Request) (*http.Response, error) {
		return nil, errors.New("dial tcp: connection refused")
	})
	app := newLogTestApp(t, "tok", rt)
	res := doLogRequest(t, app, "?repo=kubestellar/console&job=42")
	assert.Equal(t, fiber.StatusBadGateway, res.StatusCode)
	body, _ := io.ReadAll(res.Body)
	assert.Contains(t, string(body), "upstream service error")
}

func TestHandleLog_Upstream404ReturnsPurgedMessage(t *testing.T) {
	rt := roundTripperFunc(func(r *http.Request) (*http.Response, error) {
		assert.Contains(t, r.URL.Path, "/repos/kubestellar/console/actions/jobs/42/logs")
		return &http.Response{
			StatusCode: http.StatusNotFound,
			Body:       io.NopCloser(strings.NewReader("not found")),
			Header:     http.Header{},
		}, nil
	})
	app := newLogTestApp(t, "tok", rt)
	res := doLogRequest(t, app, "?repo=kubestellar/console&job=42")
	assert.Equal(t, fiber.StatusNotFound, res.StatusCode)
	body, _ := io.ReadAll(res.Body)
	assert.Contains(t, string(body), "Log not available")
	assert.Contains(t, string(body), "purged")
}

func TestHandleLog_UpstreamServerErrorReturns502WithStatusEcho(t *testing.T) {
	rt := roundTripperFunc(func(r *http.Request) (*http.Response, error) {
		return &http.Response{
			StatusCode: http.StatusInternalServerError,
			Body:       io.NopCloser(strings.NewReader("boom")),
			Header:     http.Header{},
		}, nil
	})
	app := newLogTestApp(t, "tok", rt)
	res := doLogRequest(t, app, "?repo=kubestellar/console&job=42")
	assert.Equal(t, fiber.StatusBadGateway, res.StatusCode)
	body, _ := io.ReadAll(res.Body)
	assert.Contains(t, string(body), "github 500")
}

func TestHandleLog_HappyPathShortLogReturnsFullBody(t *testing.T) {
	// N < ghpLogTailLines: expect the full body back, and TruncatedFrom to
	// match the wire-format line count (strings.Split on "\n" of a "foo\nbar"
	// body yields 2 lines; of "foo\nbar\n" yields 3 — pin the actual value
	// the handler computes so a future refactor of the counting can't drift).
	const bodyText = "line-1\nline-2\nline-3"
	rt := roundTripperFunc(func(r *http.Request) (*http.Response, error) {
		return &http.Response{
			StatusCode: http.StatusOK,
			Body:       io.NopCloser(strings.NewReader(bodyText)),
			Header:     http.Header{},
		}, nil
	})
	app := newLogTestApp(t, "tok", rt)
	res := doLogRequest(t, app, "?repo=kubestellar/console&job=42")
	require.Equal(t, fiber.StatusOK, res.StatusCode)

	var payload ghpLogPayload
	require.NoError(t, json.NewDecoder(res.Body).Decode(&payload))
	assert.Equal(t, ghpLogTailLines, payload.Lines,
		"Lines field is always the tail size, not the returned line count")
	assert.Equal(t, 3, payload.TruncatedFrom,
		"3-line body yields TruncatedFrom=3 (post-split length)")
	assert.Equal(t, bodyText, payload.Log,
		"body shorter than the tail is returned in full")
}

func TestHandleLog_HappyPathLongLogReturnsOnlyTail(t *testing.T) {
	// N > ghpLogTailLines: assert the returned Log is exactly the last
	// ghpLogTailLines lines and TruncatedFrom reports the full pre-tail
	// count. This pins the "start = total - ghpLogTailLines; if start < 0
	// { start = 0 }" arithmetic against off-by-one or sign-flip
	// regressions.
	const extra = 12
	total := ghpLogTailLines + extra
	lines := make([]string, total)
	for i := 0; i < total; i++ {
		lines[i] = fmt.Sprintf("line-%04d", i)
	}
	fullBody := strings.Join(lines, "\n")

	rt := roundTripperFunc(func(r *http.Request) (*http.Response, error) {
		return &http.Response{
			StatusCode: http.StatusOK,
			Body:       io.NopCloser(strings.NewReader(fullBody)),
			Header:     http.Header{},
		}, nil
	})
	app := newLogTestApp(t, "tok", rt)
	res := doLogRequest(t, app, "?repo=kubestellar/console&job=42")
	require.Equal(t, fiber.StatusOK, res.StatusCode)

	var payload ghpLogPayload
	require.NoError(t, json.NewDecoder(res.Body).Decode(&payload))
	assert.Equal(t, ghpLogTailLines, payload.Lines)
	assert.Equal(t, total, payload.TruncatedFrom)

	wantTail := strings.Join(lines[extra:], "\n")
	assert.Equal(t, wantTail, payload.Log,
		"returned tail must be exactly the last ghpLogTailLines lines "+
			"(pins the start = total - ghpLogTailLines math)")
	returnedLines := strings.Split(payload.Log, "\n")
	assert.Len(t, returnedLines, ghpLogTailLines)
	assert.Equal(t, "line-0012", returnedLines[0], "first returned line is total-tail")
	assert.Equal(t, fmt.Sprintf("line-%04d", total-1), returnedLines[len(returnedLines)-1])
}

func TestHandleLog_HappyPathExactBoundaryReturnsAllLines(t *testing.T) {
	// N == ghpLogTailLines: boundary case — start should clamp to 0 via the
	// `if start < 0 { start = 0 }` guard, and no truncation should occur.
	lines := make([]string, ghpLogTailLines)
	for i := range lines {
		lines[i] = fmt.Sprintf("line-%d", i)
	}
	fullBody := strings.Join(lines, "\n")

	rt := roundTripperFunc(func(r *http.Request) (*http.Response, error) {
		return &http.Response{
			StatusCode: http.StatusOK,
			Body:       io.NopCloser(strings.NewReader(fullBody)),
			Header:     http.Header{},
		}, nil
	})
	app := newLogTestApp(t, "tok", rt)
	res := doLogRequest(t, app, "?repo=kubestellar/console&job=42")
	require.Equal(t, fiber.StatusOK, res.StatusCode)

	var payload ghpLogPayload
	require.NoError(t, json.NewDecoder(res.Body).Decode(&payload))
	assert.Equal(t, ghpLogTailLines, payload.TruncatedFrom)
	assert.Equal(t, fullBody, payload.Log,
		"exact-boundary body is returned in full — no lines dropped")
}

func TestHandleLog_ForwardsRateLimitHeaders(t *testing.T) {
	// Pins that upstream X-RateLimit-* headers reach the fiber response so
	// the frontend can back off gracefully. ghpForwardRateLimitHeaders is
	// module-internal, but its effect is observable via the response
	// headers on any 200 response.
	rt := roundTripperFunc(func(r *http.Request) (*http.Response, error) {
		h := http.Header{}
		h.Set("X-RateLimit-Remaining", "4999")
		h.Set("X-RateLimit-Limit", "5000")
		h.Set("X-RateLimit-Reset", "1717171717")
		return &http.Response{
			StatusCode: http.StatusOK,
			Body:       io.NopCloser(strings.NewReader("one\ntwo")),
			Header:     h,
		}, nil
	})
	app := newLogTestApp(t, "tok", rt)
	res := doLogRequest(t, app, "?repo=kubestellar/console&job=42")
	require.Equal(t, fiber.StatusOK, res.StatusCode)
	assert.Equal(t, "4999", res.Header.Get("X-RateLimit-Remaining"))
	assert.Equal(t, "5000", res.Header.Get("X-RateLimit-Limit"))
	assert.Equal(t, "1717171717", res.Header.Get("X-RateLimit-Reset"))
}
