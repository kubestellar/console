package notifications

import (
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

// erroringBody yields a read error, letting us verify the drain path in
// deferred body cleanup does not panic when the response body is faulty.
type erroringBody struct{}

func (erroringBody) Read(p []byte) (int, error) { return 0, errors.New("read failure") }
func (erroringBody) Close() error                { return nil }

func TestPagerDuty_sendEvent_HTTPTransportError(t *testing.T) {
	// When the underlying transport returns an error, sendEvent must
	// wrap it as "failed to send pagerduty notification".
	notifier := NewPagerDutyNotifier("routing-key")
	notifier.HTTPClient.Transport = roundTripFunc(func(*http.Request) (*http.Response, error) {
		return nil, errors.New("dial tcp: connection refused")
	})

	err := notifier.Send(Alert{
		ID:       "a1",
		RuleID:   "r1",
		RuleName: "Rule",
		Cluster:  "c1",
		Message:  "oops",
		Severity: SeverityCritical,
		FiredAt:  time.Now(),
	})

	require.Error(t, err)
	require.Contains(t, err.Error(), "failed to send pagerduty notification")
	require.Contains(t, err.Error(), "connection refused")
}

func TestPagerDuty_sendEvent_NonAcceptedStatusReturnsError(t *testing.T) {
	// PagerDuty Events v2 only reports success via HTTP 202. Anything
	// else (400, 429, 5xx …) must surface as an error with the status.
	for _, code := range []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusTooManyRequests, http.StatusInternalServerError} {
		notifier := NewPagerDutyNotifier("routing-key")
		notifier.HTTPClient.Transport = roundTripFunc(func(*http.Request) (*http.Response, error) {
			return &http.Response{
				StatusCode: code,
				Body:       io.NopCloser(strings.NewReader(`{"error":"bad"}`)),
			}, nil
		})

		err := notifier.Send(Alert{
			ID: "a1", RuleID: "r1", Cluster: "c1", Message: "x",
			Severity: SeverityWarning, FiredAt: time.Now(),
		})
		require.Errorf(t, err, "status %d should produce error", code)
		require.Contains(t, err.Error(), "pagerduty API returned status")
	}
}

func TestPagerDuty_sendEvent_DrainsErroringBodyWithoutPanic(t *testing.T) {
	// The deferred drain uses io.Copy(io.Discard, LimitReader). Confirm a
	// body whose Read fails does not surface a panic from the drain path.
	notifier := NewPagerDutyNotifier("routing-key")
	notifier.HTTPClient.Transport = roundTripFunc(func(*http.Request) (*http.Response, error) {
		return &http.Response{
			StatusCode: http.StatusAccepted,
			Body:       erroringBody{},
		}, nil
	})

	require.NotPanics(t, func() {
		_ = notifier.Send(Alert{
			ID: "a1", RuleID: "r1", Cluster: "c1", Message: "x",
			Severity: SeverityInfo, FiredAt: time.Now(),
		})
	})
}

func TestPagerDuty_Test_TriggerAndResolve(t *testing.T) {
	// Test() sends trigger + resolve — both must fire and both must be
	// dedup-key-tagged. Cover the happy path plus the trigger-fails and
	// resolve-fails branches.

	t.Run("trigger and resolve both accepted", func(t *testing.T) {
		var actions []string
		notifier := NewPagerDutyNotifier("routing-key")
		notifier.HTTPClient.Transport = roundTripFunc(func(req *http.Request) (*http.Response, error) {
			body, _ := io.ReadAll(req.Body)
			if strings.Contains(string(body), `"event_action":"trigger"`) {
				actions = append(actions, "trigger")
			}
			if strings.Contains(string(body), `"event_action":"resolve"`) {
				actions = append(actions, "resolve")
			}
			return &http.Response{
				StatusCode: http.StatusAccepted,
				Body:       io.NopCloser(strings.NewReader(`{}`)),
			}, nil
		})

		require.NoError(t, notifier.Test())
		require.Equal(t, []string{"trigger", "resolve"}, actions)
	})

	t.Run("returns error when trigger fails", func(t *testing.T) {
		notifier := NewPagerDutyNotifier("routing-key")
		notifier.HTTPClient.Transport = roundTripFunc(func(*http.Request) (*http.Response, error) {
			return &http.Response{
				StatusCode: http.StatusBadRequest,
				Body:       io.NopCloser(strings.NewReader(``)),
			}, nil
		})
		err := notifier.Test()
		require.Error(t, err)
		require.Contains(t, err.Error(), "status")
	})
}

func TestOpsGenie_Send_ErrorsWhenAPIKeyEmpty(t *testing.T) {
	n := NewOpsGenieNotifier("")
	err := n.Send(Alert{ID: "a1", Message: "x", FiredAt: time.Now()})
	require.Error(t, err)
	require.Contains(t, err.Error(), "API key not configured")
}

func TestOpsGenie_createAlert_HTTPTransportError(t *testing.T) {
	notifier := NewOpsGenieNotifier("api-key")
	notifier.HTTPClient.Transport = roundTripFunc(func(*http.Request) (*http.Response, error) {
		return nil, errors.New("dial tcp: timeout")
	})

	err := notifier.Send(Alert{
		ID:       "a1",
		RuleID:   "r1",
		RuleName: "R",
		Cluster:  "c1",
		Message:  "boom",
		Severity: SeverityCritical,
		FiredAt:  time.Now(),
	})
	require.Error(t, err)
	require.Contains(t, err.Error(), "failed to send opsgenie notification")
}

func TestOpsGenie_createAlert_NonSuccessStatusReturnsError(t *testing.T) {
	// createAlert accepts 202 (async) and 201 (created). Anything else errors.
	for _, code := range []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusInternalServerError} {
		notifier := NewOpsGenieNotifier("api-key")
		notifier.HTTPClient.Transport = roundTripFunc(func(*http.Request) (*http.Response, error) {
			return &http.Response{
				StatusCode: code,
				Body:       io.NopCloser(strings.NewReader(``)),
			}, nil
		})
		err := notifier.Send(Alert{
			ID: "a1", RuleID: "r1", Cluster: "c1",
			Message: "x", Severity: SeverityInfo, FiredAt: time.Now(),
		})
		require.Errorf(t, err, "status %d should produce error", code)
		require.Contains(t, err.Error(), "opsgenie API returned status")
	}
}

func TestOpsGenie_createAlert_Accepts201And202(t *testing.T) {
	for _, code := range []int{http.StatusAccepted, http.StatusCreated} {
		notifier := NewOpsGenieNotifier("api-key")
		notifier.HTTPClient.Transport = roundTripFunc(func(*http.Request) (*http.Response, error) {
			return &http.Response{
				StatusCode: code,
				Body:       io.NopCloser(strings.NewReader(`{"result":"ok"}`)),
			}, nil
		})
		err := notifier.Send(Alert{
			ID: "a1", RuleID: "r1", Cluster: "c1",
			Message: "x", Severity: SeverityInfo, FiredAt: time.Now(),
		})
		require.NoErrorf(t, err, "status %d should succeed", code)
	}
}

func TestOpsGenie_closeAlert_RejectsInvalidAliasCharacters(t *testing.T) {
	notifier := NewOpsGenieNotifier("api-key")
	// Any HTTP call would panic loudly (nil transport) — but we expect the
	// alias-validation guard to short-circuit before any request is sent.
	notifier.HTTPClient.Transport = roundTripFunc(func(*http.Request) (*http.Response, error) {
		t.Fatalf("closeAlert must not issue a request when alias is invalid")
		return nil, nil
	})

	// Route to closeAlert via Status == "resolved".
	err := notifier.Send(Alert{
		ID: "a1", RuleID: "rule\nwith-newline", Cluster: "c1",
		Status: "resolved", Message: "x", FiredAt: time.Now(),
	})
	require.Error(t, err)
	require.Contains(t, err.Error(), "invalid characters")
}

func TestOpsGenie_closeAlert_EscapesSlashInAlias(t *testing.T) {
	notifier := NewOpsGenieNotifier("api-key")
	var seenURL string
	notifier.HTTPClient.Transport = roundTripFunc(func(req *http.Request) (*http.Response, error) {
		seenURL = req.URL.String()
		return &http.Response{
			StatusCode: http.StatusAccepted,
			Body:       io.NopCloser(strings.NewReader(`{}`)),
		}, nil
	})

	err := notifier.Send(Alert{
		ID: "a1", RuleID: "rule/1", Cluster: "cluster/A",
		Status: "resolved", Message: "x", FiredAt: time.Now(),
	})
	require.NoError(t, err)
	// The '/' in rule/1 and cluster/A must be percent-encoded so the whole
	// alias stays inside a single path segment (#6639).
	require.Contains(t, seenURL, "%2F")
	require.NotContains(t, seenURL, "rule/1")
}

func TestOpsGenie_closeAlert_HTTPTransportError(t *testing.T) {
	notifier := NewOpsGenieNotifier("api-key")
	notifier.HTTPClient.Transport = roundTripFunc(func(*http.Request) (*http.Response, error) {
		return nil, errors.New("dial tcp: reset")
	})

	err := notifier.Send(Alert{
		ID: "a1", RuleID: "r1", Cluster: "c1",
		Status: "resolved", Message: "x", FiredAt: time.Now(),
	})
	require.Error(t, err)
	require.Contains(t, err.Error(), "failed to send opsgenie close")
}

func TestOpsGenie_closeAlert_NonSuccessStatusReturnsError(t *testing.T) {
	for _, code := range []int{http.StatusBadRequest, http.StatusNotFound, http.StatusInternalServerError} {
		notifier := NewOpsGenieNotifier("api-key")
		notifier.HTTPClient.Transport = roundTripFunc(func(*http.Request) (*http.Response, error) {
			return &http.Response{
				StatusCode: code,
				Body:       io.NopCloser(strings.NewReader(``)),
			}, nil
		})
		err := notifier.Send(Alert{
			ID: "a1", RuleID: "r1", Cluster: "c1",
			Status: "resolved", Message: "x", FiredAt: time.Now(),
		})
		require.Errorf(t, err, "close status %d should produce error", code)
		require.Contains(t, err.Error(), "opsgenie close API returned status")
	}
}

func TestOpsGenie_Test_CreatesAndCloses(t *testing.T) {
	// Test() creates a test alert then closes it. Verify both requests
	// fire against expected paths.
	var createHit, closeHit bool
	notifier := NewOpsGenieNotifier("api-key")
	notifier.HTTPClient.Transport = roundTripFunc(func(req *http.Request) (*http.Response, error) {
		if strings.HasSuffix(req.URL.Path, "/close") {
			closeHit = true
			return &http.Response{StatusCode: http.StatusAccepted, Body: io.NopCloser(strings.NewReader(`{}`))}, nil
		}
		createHit = true
		return &http.Response{StatusCode: http.StatusAccepted, Body: io.NopCloser(strings.NewReader(`{}`))}, nil
	})

	require.NoError(t, notifier.Test())
	require.True(t, createHit, "create alert must be called")
	require.True(t, closeHit, "close alert must be called")
}

func TestOpsGenie_Test_ReturnsErrorWhenCreateFails(t *testing.T) {
	notifier := NewOpsGenieNotifier("api-key")
	notifier.HTTPClient.Transport = roundTripFunc(func(*http.Request) (*http.Response, error) {
		return nil, errors.New("dial tcp: refused")
	})
	err := notifier.Test()
	require.Error(t, err)
	require.Contains(t, err.Error(), "opsgenie")
}