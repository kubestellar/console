package notifications

import (
	"encoding/json"
	"io"
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
