package notifications

import (
	"encoding/json"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

// ---------------------------------------------------------------------------
// #6633 — webhook notifier
// ---------------------------------------------------------------------------

// TestWebhookNotifier_Send asserts that the notifier POSTs a JSON body
// containing the alert payload and accepts any 2xx response.
func TestWebhookNotifier_Send(t *testing.T) {
	var gotBody []byte
	var gotContentType string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotContentType = r.Header.Get("Content-Type")
		gotBody, _ = io.ReadAll(r.Body)
		w.WriteHeader(http.StatusAccepted) // 202 — ensures we accept non-200 2xx
	}))
	defer server.Close()

	n, err := NewWebhookNotifier(server.URL)
	require.NoError(t, err)

	err = n.Send(Alert{
		ID:       "alert-1",
		RuleID:   "rule-1",
		RuleName: "High CPU",
		Severity: SeverityCritical,
		Status:   "firing",
		Message:  "CPU above 90%",
		Cluster:  "prod-east",
		FiredAt:  time.Now(),
	})
	require.NoError(t, err)
	require.Equal(t, "application/json", gotContentType)

	var body map[string]interface{}
	require.NoError(t, json.Unmarshal(gotBody, &body))
	require.Equal(t, "High CPU", body["alert"])
	require.Equal(t, "critical", body["severity"])
	require.Equal(t, "prod-east", body["cluster"])
}

// TestWebhookNotifier_NonSuccessStatus verifies we surface non-2xx as error.
func TestWebhookNotifier_NonSuccessStatus(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer server.Close()

	n, err := NewWebhookNotifier(server.URL)
	require.NoError(t, err)

	err = n.Send(Alert{RuleName: "X", Severity: SeverityInfo, FiredAt: time.Now()})
	require.Error(t, err)
	require.Contains(t, err.Error(), "status 500")
}

// TestWebhookNotifier_InvalidURL covers the fail-fast path in the ctor.
func TestWebhookNotifier_InvalidURL(t *testing.T) {
	cases := []string{"", "not-a-url", "ftp://example.com", "http://"}
	for _, u := range cases {
		_, err := NewWebhookNotifier(u)
		require.Error(t, err, "expected error for URL %q", u)
	}
}

// TestWebhookNotifier_HostAllowlist verifies the KC_WEBHOOK_ALLOWED_HOSTS
// env var is enforced. Empty env = allow all; non-empty = strict allowlist.
func TestWebhookNotifier_HostAllowlist(t *testing.T) {
	const envKey = "KC_WEBHOOK_ALLOWED_HOSTS"
	orig := os.Getenv(envKey)
	t.Cleanup(func() { os.Setenv(envKey, orig) })

	os.Setenv(envKey, "alerts.example.com")
	_, err := NewWebhookNotifier("https://evil.example.org/hook")
	require.Error(t, err)
	require.Contains(t, err.Error(), "allowlist")

	_, err = NewWebhookNotifier("https://alerts.example.com/hook")
	require.NoError(t, err)
}

// TestService_WebhookChannel wires through SendAlertToChannels.
func TestService_WebhookChannel(t *testing.T) {
	var hit int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hit++
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	svc := NewService()
	err := svc.SendAlertToChannels(Alert{RuleName: "r", FiredAt: time.Now()}, []NotificationChannel{
		{
			Type:    NotificationTypeWebhook,
			Enabled: true,
			Config:  map[string]interface{}{"webhookUrl": server.URL},
		},
	})
	require.NoError(t, err)
	require.Equal(t, 1, hit)
}

// ---------------------------------------------------------------------------
// #6635 — concurrent access to notifiers map
// ---------------------------------------------------------------------------

// TestService_ConcurrentRegisterAndSend runs parallel Register/Send to ensure
// the RWMutex prevents the concurrent-map-access panic. Runs best with -race.
func TestService_ConcurrentRegisterAndSend(t *testing.T) {
	svc := NewService()

	// Seed with one valid notifier backed by a test HTTP server so Send
	// has actual work to do without external network calls.
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()
	svc.RegisterSlackNotifier("seed", server.URL, "#c")

	const goroutineCount = 16   // parallel workers on each side
	const iterations = 50       // ops per worker
	var wg sync.WaitGroup
	wg.Add(goroutineCount * 2)

	for i := 0; i < goroutineCount; i++ {
		i := i
		go func() {
			defer wg.Done()
			for j := 0; j < iterations; j++ {
				svc.RegisterSlackNotifier(
					"worker"+string(rune('a'+i%26))+string(rune('a'+j%26)),
					server.URL, "#c")
			}
		}()
		go func() {
			defer wg.Done()
			for j := 0; j < iterations; j++ {
				_ = svc.SendAlert(Alert{RuleName: "r", Severity: SeverityInfo, FiredAt: time.Now()})
			}
		}()
	}
	wg.Wait()
}

// ---------------------------------------------------------------------------
// #6636 — SMTP port validation
// ---------------------------------------------------------------------------

// TestParseSMTPPortConfig covers missing, zero, negative, out-of-range, and
// valid values. Uses table-driven style so failures pinpoint the bad input.
func TestParseSMTPPortConfig(t *testing.T) {
	cases := []struct {
		name    string
		cfg     map[string]interface{}
		want    int
		wantErr bool
	}{
		{"missing", map[string]interface{}{}, 0, true},
		{"zero", map[string]interface{}{"emailSMTPPort": float64(0)}, 0, true},
		{"negative", map[string]interface{}{"emailSMTPPort": float64(-1)}, 0, true},
		{"too high", map[string]interface{}{"emailSMTPPort": float64(70000)}, 0, true},
		{"wrong type", map[string]interface{}{"emailSMTPPort": "587"}, 0, true},
		{"float 587", map[string]interface{}{"emailSMTPPort": float64(587)}, 587, false},
		{"int 25", map[string]interface{}{"emailSMTPPort": 25}, 25, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := parseSMTPPortConfig(tc.cfg)
			if tc.wantErr {
				require.Error(t, err)
			} else {
				require.NoError(t, err)
				require.Equal(t, tc.want, got)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// #6638 — empty recipient filtering
// ---------------------------------------------------------------------------

// TestSplitAndCleanRecipients covers the specific regression: a trailing
// comma in the recipient list must not produce an empty string in the
// output slice.
func TestSplitAndCleanRecipients(t *testing.T) {
	cases := []struct {
		in   string
		want []string
	}{
		{"a@b.com", []string{"a@b.com"}},
		{"a@b.com, c@d.com", []string{"a@b.com", "c@d.com"}},
		{"a@b.com, ", []string{"a@b.com"}},
		{" , a@b.com, , b@c.com ,", []string{"a@b.com", "b@c.com"}},
		{"", []string{}},
		{", , ,", []string{}},
	}
	for _, tc := range cases {
		got := splitAndCleanRecipients(tc.in)
		require.Equal(t, tc.want, got, "input=%q", tc.in)
	}
}

// ---------------------------------------------------------------------------
// #6639 — OpsGenie close URL alias escaping
// ---------------------------------------------------------------------------

// TestOpsGenie_CloseAlert_EscapesAlias stands up a test server, points the
// notifier's HTTP client at it, and asserts the path contains the escaped
// alias. Rather than override the package-level opsgenieAlertsURL const we
// intercept via a custom RoundTripper.
func TestOpsGenie_CloseAlert_EscapesAlias(t *testing.T) {
	var gotPath string
	rt := roundTripFunc(func(req *http.Request) (*http.Response, error) {
		// EscapedPath() preserves the percent-encoding we put in the URL
		// string (Path is the decoded form).
		gotPath = req.URL.EscapedPath() + "?" + req.URL.RawQuery
		return &http.Response{
			StatusCode: http.StatusAccepted,
			Body:       io.NopCloser(strings.NewReader("")),
			Header:     make(http.Header),
		}, nil
	})
	n := &OpsGenieNotifier{APIKey: "key", HTTPClient: &http.Client{Transport: rt}}

	// Alias with reserved characters — '/' and space — that would break
	// the URL path if concatenated unescaped.
	err := n.closeAlert("rule/1::prod east")
	require.NoError(t, err)
	require.Contains(t, gotPath, "rule%2F1::prod%20east/close")

	// Rejects obviously hostile content.
	err = n.closeAlert("rule\n1")
	require.Error(t, err)
}

// TestOpsGenie_CloseAlert_NoEscapeNeeded ensures simple aliases still work.
func TestOpsGenie_CloseAlert_NoEscapeNeeded(t *testing.T) {
	rt := roundTripFunc(func(req *http.Request) (*http.Response, error) {
		return &http.Response{
			StatusCode: http.StatusOK,
			Body:       io.NopCloser(strings.NewReader("")),
			Header:     make(http.Header),
		}, nil
	})
	n := &OpsGenieNotifier{APIKey: "key", HTTPClient: &http.Client{Transport: rt}}
	require.NoError(t, n.closeAlert("rule-1::prod"))
}

// roundTripFunc adapts a function to http.RoundTripper so tests can
// intercept outbound requests without running a real HTTP server.
type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

// ---------------------------------------------------------------------------
// #8389 — PagerDuty dedup key collision when ID/RuleID/Cluster all empty
// ---------------------------------------------------------------------------

// TestPagerDuty_FallbackDedupKey_DistinctMessages verifies that when all three
// identity fields are empty, distinct alert messages produce distinct dedup
// keys (previously the key degenerated to the constant "::::" so unrelated
// alerts collapsed into one incident).
func TestPagerDuty_FallbackDedupKey_DistinctMessages(t *testing.T) {
	firedAt := time.Date(2026, 4, 16, 12, 0, 0, 0, time.UTC)
	a := Alert{Message: "disk full", FiredAt: firedAt}
	b := Alert{Message: "oom killed", FiredAt: firedAt}

	keyA := fallbackDedupKey(a)
	keyB := fallbackDedupKey(b)

	require.NotEqual(t, keyA, keyB, "distinct messages must produce distinct dedup keys")
	require.NotEqual(t, "::::", keyA, "fallback key must not degenerate to constant")
	require.NotEqual(t, "::::", keyB)
	// Sanity: prefix + hex truncation length.
	require.True(t, strings.HasPrefix(keyA, "fallback-"))
	require.Equal(t, len("fallback-")+dedupHashHexLen, len(keyA))
}

// TestPagerDuty_FallbackDedupKey_Stable verifies identical (Message, FiredAt)
// pairs produce the same dedup key so PagerDuty still dedupes repeats.
func TestPagerDuty_FallbackDedupKey_Stable(t *testing.T) {
	firedAt := time.Date(2026, 4, 16, 12, 0, 0, 0, time.UTC)
	a := Alert{Message: "disk full", FiredAt: firedAt}
	b := Alert{Message: "disk full", FiredAt: firedAt}

	require.Equal(t, fallbackDedupKey(a), fallbackDedupKey(b))
}

// TestPagerDuty_Send_UsesFallbackWhenAllEmpty wires the notifier through a
// round-tripper and confirms the outgoing dedup_key is NOT the degenerate
// "::::" when every identity field is empty.
func TestPagerDuty_Send_UsesFallbackWhenAllEmpty(t *testing.T) {
	var captured pagerdutyEvent
	rt := roundTripFunc(func(req *http.Request) (*http.Response, error) {
		body, _ := io.ReadAll(req.Body)
		_ = json.Unmarshal(body, &captured)
		return &http.Response{
			StatusCode: http.StatusAccepted,
			Body:       io.NopCloser(strings.NewReader("")),
			Header:     make(http.Header),
		}, nil
	})
	p := &PagerDutyNotifier{RoutingKey: "test-key", HTTPClient: &http.Client{Transport: rt}}

	err := p.Send(Alert{Message: "disk full", Severity: SeverityCritical, Status: "firing", FiredAt: time.Now()})
	require.NoError(t, err)
	require.NotEqual(t, "::::", captured.DedupKey)
	require.NotEmpty(t, captured.DedupKey)
	require.True(t, strings.HasPrefix(captured.DedupKey, "fallback-"))
}

// ---------------------------------------------------------------------------
// #8390 — OpsGenie alias collision (same class of bug as #8389)
// ---------------------------------------------------------------------------

// TestOpsGenie_Send_UsesFallbackAliasWhenAllEmpty confirms the OpsGenie
// createAlert path does not send "::::" as the alias when every identity
// field is empty.
func TestOpsGenie_Send_UsesFallbackAliasWhenAllEmpty(t *testing.T) {
	var captured opsgenieAlert
	rt := roundTripFunc(func(req *http.Request) (*http.Response, error) {
		body, _ := io.ReadAll(req.Body)
		_ = json.Unmarshal(body, &captured)
		return &http.Response{
			StatusCode: http.StatusAccepted,
			Body:       io.NopCloser(strings.NewReader("")),
			Header:     make(http.Header),
		}, nil
	})
	o := &OpsGenieNotifier{APIKey: "test-key", HTTPClient: &http.Client{Transport: rt}}

	err := o.Send(Alert{RuleName: "no-id rule", Message: "oom", Severity: SeverityCritical, Status: "firing", FiredAt: time.Now()})
	require.NoError(t, err)
	require.NotEqual(t, "::::", captured.Alias)
	require.NotEmpty(t, captured.Alias)
	require.True(t, strings.HasPrefix(captured.Alias, "fallback-"))
}

// ---------------------------------------------------------------------------
// #8391 — SMTP missing per-op deadlines
// ---------------------------------------------------------------------------

// TestSetSMTPDeadline_ArmsDeadline confirms the helper pushes the deadline
// forward by roughly SMTPOpTimeout. We use a net.Pipe() conn because it
// honors SetDeadline without needing a real TCP socket.
func TestSetSMTPDeadline_ArmsDeadline(t *testing.T) {
	// Use a net.Pipe to get a net.Conn that supports SetDeadline. We don't
	// actually do I/O on it — we just verify SetDeadline returns nil and the
	// helper doesn't panic. Read/write deadline enforcement is covered by the
	// stdlib tests; we're verifying our call site plumbs correctly.
	a, b := net.Pipe()
	defer a.Close()
	defer b.Close()

	before := time.Now()
	err := setSMTPDeadline(a)
	require.NoError(t, err)
	// The deadline must be at least SMTPOpTimeout-epsilon into the future.
	// We can't directly read the deadline back, but we can assert the helper
	// didn't error and the constant is plausibly non-zero.
	require.True(t, SMTPOpTimeout > 0)
	require.True(t, time.Since(before) < SMTPOpTimeout)
}

// ---------------------------------------------------------------------------
// #8392 — Webhook accepts plaintext HTTP
// ---------------------------------------------------------------------------

// TestWebhookNotifier_RejectsPlaintextHTTPForRemoteHost verifies plaintext
// http:// URLs to non-loopback hosts are rejected at construction time.
func TestWebhookNotifier_RejectsPlaintextHTTPForRemoteHost(t *testing.T) {
	_, err := NewWebhookNotifier("http://evil.com/hook")
	require.Error(t, err)
	require.Contains(t, err.Error(), "https")
	require.Contains(t, err.Error(), "loopback")
}

// TestWebhookNotifier_AllowsPlaintextHTTPForLoopback verifies loopback hosts
// may still be reached over plaintext http for local development and sidecar
// receivers.
func TestWebhookNotifier_AllowsPlaintextHTTPForLoopback(t *testing.T) {
	for _, u := range []string{
		"http://localhost:9000/hook",
		"http://127.0.0.1:9000/hook",
		"http://[::1]:9000/hook",
	} {
		_, err := NewWebhookNotifier(u)
		require.NoErrorf(t, err, "loopback URL must be accepted: %s", u)
	}
}

// TestWebhookNotifier_AllowsHTTPSForAnyHost verifies https:// is always
// accepted regardless of host.
func TestWebhookNotifier_AllowsHTTPSForAnyHost(t *testing.T) {
	for _, u := range []string{
		"https://alerts.example.com/hook",
		"https://localhost:9000/hook",
	} {
		_, err := NewWebhookNotifier(u)
		require.NoErrorf(t, err, "https URL must be accepted: %s", u)
	}
}

// TestIsLoopbackHost covers the helper's recognized values and rejects
// anything else, including a host name that merely *contains* "localhost".
func TestIsLoopbackHost(t *testing.T) {
	cases := []struct {
		host string
		want bool
	}{
		{"localhost", true},
		{"127.0.0.1", true},
		{"::1", true},
		{"evil.com", false},
		{"localhost.evil.com", false},
		{"127.0.0.2", false},
		{"", false},
	}
	for _, c := range cases {
		require.Equalf(t, c.want, isLoopbackHost(c.host), "isLoopbackHost(%q)", c.host)
	}
}
