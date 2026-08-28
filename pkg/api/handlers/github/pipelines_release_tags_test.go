package github

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// bodyString returns an http.Response with a fixed status and JSON body.
func fixedResponse(status int, body string) *http.Response {
	return &http.Response{
		StatusCode: status,
		Body:       io.NopCloser(strings.NewReader(body)),
		Header:     make(http.Header),
	}
}

// pathRouter dispatches on the request path suffix so a single handler can
// answer both /releases and /tags for the three tag-resolver functions.
type pathRouter map[string]*http.Response

func (r pathRouter) transport(t *testing.T) RoundTripFunc {
	return func(req *http.Request) *http.Response {
		for suffix, resp := range r {
			if strings.Contains(req.URL.Path+"?"+req.URL.RawQuery, suffix) {
				return resp
			}
		}
		t.Fatalf("unexpected request path: %s?%s", req.URL.Path, req.URL.RawQuery)
		return nil
	}
}

func newTestHandler(rt RoundTripFunc) *GitHubPipelinesHandler {
	return &GitHubPipelinesHandler{
		token:      "test-token",
		httpClient: &http.Client{Transport: rt},
	}
}

// ─── ghpLatestWeeklyTag ────────────────────────────────────────────────────

func TestGhpLatestWeeklyTag_ReturnsTagFromLatestRelease(t *testing.T) {
	h := newTestHandler(func(req *http.Request) *http.Response {
		assert.Contains(t, req.URL.Path, "/releases/latest")
		return fixedResponse(http.StatusOK, `{"tag_name":"v0.42.0"}`)
	})

	got := ghpLatestWeeklyTag(context.Background(), h, "owner/repo")
	require.NotNil(t, got)
	assert.Equal(t, "v0.42.0", *got)
}

func TestGhpLatestWeeklyTag_NilOnNon200(t *testing.T) {
	h := newTestHandler(func(req *http.Request) *http.Response {
		return fixedResponse(http.StatusNotFound, `{"message":"Not Found"}`)
	})

	assert.Nil(t, ghpLatestWeeklyTag(context.Background(), h, "owner/repo"))
}

func TestGhpLatestWeeklyTag_NilOnEmptyTag(t *testing.T) {
	h := newTestHandler(func(req *http.Request) *http.Response {
		return fixedResponse(http.StatusOK, `{"tag_name":""}`)
	})

	assert.Nil(t, ghpLatestWeeklyTag(context.Background(), h, "owner/repo"))
}

func TestGhpLatestWeeklyTag_NilOnMalformedJSON(t *testing.T) {
	h := newTestHandler(func(req *http.Request) *http.Response {
		return fixedResponse(http.StatusOK, `not-json`)
	})

	assert.Nil(t, ghpLatestWeeklyTag(context.Background(), h, "owner/repo"))
}

func TestGhpLatestWeeklyTag_NilOnTransportError(t *testing.T) {
	h := &GitHubPipelinesHandler{
		token:      "test-token",
		httpClient: &http.Client{Transport: errorTransport{}},
	}
	assert.Nil(t, ghpLatestWeeklyTag(context.Background(), h, "owner/repo"))
}

// errorTransport always returns an error, exercising the transport-error
// branch of the ghGet callers.
type errorTransport struct{}

func (errorTransport) RoundTrip(*http.Request) (*http.Response, error) {
	return nil, io.ErrUnexpectedEOF
}

// ─── ghpLatestNightlyReleaseTag ────────────────────────────────────────────

func TestGhpLatestNightlyReleaseTag_PicksNewestByPublishedAt(t *testing.T) {
	body := `[
	  {"tag_name":"v0.1-nightly-2024-01-01","published_at":"2024-01-01T00:00:00Z"},
	  {"tag_name":"v0.1-nightly-2024-06-01","published_at":"2024-06-01T00:00:00Z"},
	  {"tag_name":"v0.1-nightly-2024-03-01","published_at":"2024-03-01T00:00:00Z"},
	  {"tag_name":"v0.42.0","published_at":"2024-07-01T00:00:00Z"}
	]`
	h := newTestHandler(func(req *http.Request) *http.Response {
		assert.Contains(t, req.URL.Path, "/releases")
		return fixedResponse(http.StatusOK, body)
	})

	got := ghpLatestNightlyReleaseTag(context.Background(), h, "owner/repo")
	require.NotNil(t, got)
	assert.Equal(t, "v0.1-nightly-2024-06-01", *got, "must select the nightly tag with the most recent published_at")
}

func TestGhpLatestNightlyReleaseTag_FallsBackToCreatedAtWhenPublishedAtNil(t *testing.T) {
	body := `[
	  {"tag_name":"v0.1-nightly-a","created_at":"2024-01-01T00:00:00Z"},
	  {"tag_name":"v0.1-nightly-b","created_at":"2024-06-01T00:00:00Z"}
	]`
	h := newTestHandler(func(req *http.Request) *http.Response {
		return fixedResponse(http.StatusOK, body)
	})

	got := ghpLatestNightlyReleaseTag(context.Background(), h, "owner/repo")
	require.NotNil(t, got)
	assert.Equal(t, "v0.1-nightly-b", *got)
}

func TestGhpLatestNightlyReleaseTag_NilOnNoNightlyMatches(t *testing.T) {
	body := `[
	  {"tag_name":"v1.0.0","published_at":"2024-06-01T00:00:00Z"},
	  {"tag_name":"v0.9.0","published_at":"2024-05-01T00:00:00Z"}
	]`
	h := newTestHandler(func(req *http.Request) *http.Response {
		return fixedResponse(http.StatusOK, body)
	})

	assert.Nil(t, ghpLatestNightlyReleaseTag(context.Background(), h, "owner/repo"))
}

func TestGhpLatestNightlyReleaseTag_NilOnEmptyArray(t *testing.T) {
	h := newTestHandler(func(req *http.Request) *http.Response {
		return fixedResponse(http.StatusOK, `[]`)
	})
	assert.Nil(t, ghpLatestNightlyReleaseTag(context.Background(), h, "owner/repo"))
}

func TestGhpLatestNightlyReleaseTag_NilOnNon200(t *testing.T) {
	h := newTestHandler(func(req *http.Request) *http.Response {
		return fixedResponse(http.StatusForbidden, `{"message":"rate limited"}`)
	})
	assert.Nil(t, ghpLatestNightlyReleaseTag(context.Background(), h, "owner/repo"))
}

func TestGhpLatestNightlyReleaseTag_NilOnMalformedJSON(t *testing.T) {
	h := newTestHandler(func(req *http.Request) *http.Response {
		return fixedResponse(http.StatusOK, `garbage`)
	})
	assert.Nil(t, ghpLatestNightlyReleaseTag(context.Background(), h, "owner/repo"))
}

func TestGhpLatestNightlyReleaseTag_NilOnTransportError(t *testing.T) {
	h := &GitHubPipelinesHandler{
		token:      "test-token",
		httpClient: &http.Client{Transport: errorTransport{}},
	}
	assert.Nil(t, ghpLatestNightlyReleaseTag(context.Background(), h, "owner/repo"))
}

// ─── ghpLatestReleaseTag ───────────────────────────────────────────────────
//
// ghpLatestReleaseTag first calls ghpLatestNightlyReleaseTag (releases API),
// then fetches /tags and, if a lexicographically-larger nightly tag exists
// there, promotes that. All error paths fall through returning whatever the
// release-tag call produced (which itself may be nil).

func routeReleasesAndTags(t *testing.T, releasesBody, releasesStatus, tagsBody, tagsStatus interface{}) RoundTripFunc {
	return func(req *http.Request) *http.Response {
		switch {
		case strings.Contains(req.URL.Path, "/releases"):
			return fixedResponse(releasesStatus.(int), releasesBody.(string))
		case strings.Contains(req.URL.Path, "/tags"):
			return fixedResponse(tagsStatus.(int), tagsBody.(string))
		}
		t.Fatalf("unexpected path: %s", req.URL.Path)
		return nil
	}
}

func TestGhpLatestReleaseTag_PromotesLargerNightlyTagFromTagsAPI(t *testing.T) {
	releases := `[{"tag_name":"nightly-2024-01","published_at":"2024-01-01T00:00:00Z"}]`
	tags := `[
	  {"name":"nightly-2024-02"},
	  {"name":"v1.0.0"},
	  {"name":"nightly-2023-12"}
	]`
	h := newTestHandler(routeReleasesAndTags(t, releases, http.StatusOK, tags, http.StatusOK))

	got := ghpLatestReleaseTag(context.Background(), h, "owner/repo")
	require.NotNil(t, got)
	assert.Equal(t, "nightly-2024-02", *got, "tags API result must win when lexicographically greater")
}

func TestGhpLatestReleaseTag_KeepsReleaseTagWhenTagsNotGreater(t *testing.T) {
	releases := `[{"tag_name":"nightly-2024-06","published_at":"2024-06-01T00:00:00Z"}]`
	tags := `[{"name":"nightly-2024-01"}]`
	h := newTestHandler(routeReleasesAndTags(t, releases, http.StatusOK, tags, http.StatusOK))

	got := ghpLatestReleaseTag(context.Background(), h, "owner/repo")
	require.NotNil(t, got)
	assert.Equal(t, "nightly-2024-06", *got, "releases-derived tag must be preserved when tags API has nothing newer")
}

func TestGhpLatestReleaseTag_UsesTagsWhenReleasesReturnsNil(t *testing.T) {
	releases := `[]`
	tags := `[{"name":"nightly-2024-02"},{"name":"v1.0.0"}]`
	h := newTestHandler(routeReleasesAndTags(t, releases, http.StatusOK, tags, http.StatusOK))

	got := ghpLatestReleaseTag(context.Background(), h, "owner/repo")
	require.NotNil(t, got)
	assert.Equal(t, "nightly-2024-02", *got)
}

func TestGhpLatestReleaseTag_FallsBackToReleaseTagWhenTagsAPIFails(t *testing.T) {
	releases := `[{"tag_name":"nightly-2024-06","published_at":"2024-06-01T00:00:00Z"}]`
	h := newTestHandler(routeReleasesAndTags(t, releases, http.StatusOK, `{"message":"forbidden"}`, http.StatusForbidden))

	got := ghpLatestReleaseTag(context.Background(), h, "owner/repo")
	require.NotNil(t, got)
	assert.Equal(t, "nightly-2024-06", *got)
}

func TestGhpLatestReleaseTag_FallsBackToReleaseTagWhenTagsAPIMalformed(t *testing.T) {
	releases := `[{"tag_name":"nightly-2024-06","published_at":"2024-06-01T00:00:00Z"}]`
	h := newTestHandler(routeReleasesAndTags(t, releases, http.StatusOK, `not-json`, http.StatusOK))

	got := ghpLatestReleaseTag(context.Background(), h, "owner/repo")
	require.NotNil(t, got)
	assert.Equal(t, "nightly-2024-06", *got)
}

func TestGhpLatestReleaseTag_IgnoresNonNightlyTagsFromTagsAPI(t *testing.T) {
	releases := `[{"tag_name":"nightly-2024-01","published_at":"2024-01-01T00:00:00Z"}]`
	tags := `[
	  {"name":"v9.9.9-stable"},
	  {"name":"random-tag"}
	]`
	h := newTestHandler(routeReleasesAndTags(t, releases, http.StatusOK, tags, http.StatusOK))

	got := ghpLatestReleaseTag(context.Background(), h, "owner/repo")
	require.NotNil(t, got)
	assert.Equal(t, "nightly-2024-01", *got, "non-nightly tag names must never overwrite the release-derived tag")
}

func TestGhpLatestReleaseTag_NilWhenBothSourcesEmpty(t *testing.T) {
	h := newTestHandler(routeReleasesAndTags(t, `[]`, http.StatusOK, `[]`, http.StatusOK))
	assert.Nil(t, ghpLatestReleaseTag(context.Background(), h, "owner/repo"))
}

func TestGhpLatestReleaseTag_TagsTransportErrorPreservesReleaseTag(t *testing.T) {
	// Once /releases succeeds and yields a nightly, a failure fetching /tags
	// must not clobber it. Simulate by returning error on the second call.
	callCount := 0
	rt := RoundTripFunc(func(req *http.Request) *http.Response {
		callCount++
		if callCount == 1 {
			return fixedResponse(http.StatusOK, `[{"tag_name":"nightly-2024-06","published_at":"2024-06-01T00:00:00Z"}]`)
		}
		// Force ghGet's http.Client.Do to return an error for /tags.
		return nil
	})
	// Wrap so the second call returns (nil, err) instead of nil response
	h := &GitHubPipelinesHandler{
		token: "test-token",
		httpClient: &http.Client{
			Transport: RoundTripFunc(func(req *http.Request) *http.Response {
				if strings.Contains(req.URL.Path, "/releases") {
					return fixedResponse(http.StatusOK, `[{"tag_name":"nightly-2024-06","published_at":"2024-06-01T00:00:00Z"}]`)
				}
				panic("triggering transport error path")
			}),
		},
	}
	// Swap to a transport that errors on /tags but succeeds on /releases.
	h.httpClient.Transport = &tagsErrorTransport{}

	got := ghpLatestReleaseTag(context.Background(), h, "owner/repo")
	require.NotNil(t, got)
	assert.Equal(t, "nightly-2024-06", *got)
	_ = rt
}

type tagsErrorTransport struct{}

func (tagsErrorTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	if strings.Contains(req.URL.Path, "/tags") {
		return nil, io.ErrUnexpectedEOF
	}
	return fixedResponse(http.StatusOK, `[{"tag_name":"nightly-2024-06","published_at":"2024-06-01T00:00:00Z"}]`), nil
}
