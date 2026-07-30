package notifications

import (
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestService_Registration(t *testing.T) {
	s := NewService()

	t.Run("Slack", func(t *testing.T) {
		s.RegisterSlackNotifier("id1", "http://localhost", "#general")
		require.Contains(t, s.snapshot(), "slack:id1")
	})

	t.Run("PagerDuty", func(t *testing.T) {
		s.RegisterPagerDutyNotifier("id1", "key-123")
		require.Contains(t, s.snapshot(), "pagerduty:id1")
	})

	t.Run("OpsGenie", func(t *testing.T) {
		s.RegisterOpsGenieNotifier("id1", "api-123")
		require.Contains(t, s.snapshot(), "opsgenie:id1")
	})

	t.Run("Email", func(t *testing.T) {
		s.RegisterEmailNotifier("id1", "smtp.host", 25, "u", "p", "from@b.c", "to@b.c")
		require.Contains(t, s.snapshot(), "email:id1")
	})

	t.Run("Email invalid port", func(t *testing.T) {
		s2 := NewService()
		s2.RegisterEmailNotifier("id1", "smtp.host", 0, "u", "p", "from@b.c", "to@b.c")
		require.Empty(t, s2.snapshot())
	})

	t.Run("Webhook", func(t *testing.T) {
		s.RegisterWebhookNotifier("id1", "http://localhost")
		require.Contains(t, s.snapshot(), "webhook:id1")
	})
}

func TestParseSMTPPortConfig(t *testing.T) {
	cases := []struct {
		name    string
		config  map[string]interface{}
		want    int
		wantErr bool
	}{
		{"valid int", map[string]interface{}{"emailSMTPPort": 25}, 25, false},
		{"valid float", map[string]interface{}{"emailSMTPPort": float64(587)}, 587, false},
		{"invalid float", map[string]interface{}{"emailSMTPPort": 587.5}, 0, true},
		{"out of range low", map[string]interface{}{"emailSMTPPort": 0}, 0, true},
		{"out of range high", map[string]interface{}{"emailSMTPPort": 70000}, 0, true},
		{"missing", map[string]interface{}{}, 0, true},
		{"wrong type", map[string]interface{}{"emailSMTPPort": "25"}, 0, true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := parseSMTPPortConfig(tc.config)
			if tc.wantErr {
				require.Error(t, err)
			} else {
				require.NoError(t, err)
				require.Equal(t, tc.want, got)
			}
		})
	}
}

func TestSplitAndCleanRecipients(t *testing.T) {
	cases := []struct {
		in   string
		want []string
	}{
		{"a@b.com", []string{"a@b.com"}},
		{"a@b.com, b@c.com", []string{"a@b.com", "b@c.com"}},
		{"  a@b.com  ,  ", []string{"a@b.com"}},
		{"", []string{}},
		{"a@b.com,   , b@c.com", []string{"a@b.com", "b@c.com"}},
		{" , ", []string{}},
	}

	for _, tc := range cases {
		require.Equal(t, tc.want, splitAndCleanRecipients(tc.in))
	}
}

func TestService_SendAlert(t *testing.T) {
	s := NewService()
	// Test with no notifiers
	err := s.SendAlert(Alert{})
	require.NoError(t, err)
}

func TestService_SendAlertToChannels(t *testing.T) {
	s := NewService()

	// Test empty channels
	err := s.SendAlertToChannels(Alert{}, nil)
	require.NoError(t, err)

	// Test disabled channel
	channels := []NotificationChannel{
		{
			Type:    NotificationTypeSlack,
			Enabled: false,
		},
	}
	err = s.SendAlertToChannels(Alert{}, channels)
	require.NoError(t, err)
}

func TestService_WebhookChannel(t *testing.T) {
	s := NewService()
	channels := []NotificationChannel{
		{
			Type:    NotificationTypeWebhook,
			Enabled: true,
			Config: map[string]interface{}{
				"webhookUrl": "http://localhost:8080",
			},
		},
	}
	// We don't care if Send fails (it will, no server), just that it doesn't crash
	// and reaches the webhook-notifier logic.
	_ = s.SendAlertToChannels(Alert{FiredAt: time.Now()}, channels)
}

func TestService_NewService(t *testing.T) {
	s := NewService()
	require.NotNil(t, s)
	require.NotNil(t, s.notifiers)
	require.Equal(t, 0, len(s.notifiers))
}

func TestService_TestNotifier(t *testing.T) {
	s := NewService()

	t.Run("Slack", func(t *testing.T) {
		ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		}))
		defer ts.Close()

		config := map[string]interface{}{"slackWebhookUrl": ts.URL}
		err := s.TestNotifier(string(NotificationTypeSlack), config)
		require.NoError(t, err)
	})

	t.Run("PagerDuty", func(t *testing.T) {
		ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusAccepted)
		}))
		defer ts.Close()

		config := map[string]interface{}{"pagerdutyRoutingKey": "key"}
		// Use a trick to override the URL in the notifier.
		// Since PagerDutyNotifier uses a const URL, we can't easily change it
		// without changing the code.
		// However, the USER request says: "Remove the sendEventToURL method and test Send() directly via RoundTripper".
		// But Service.TestNotifier creates its own notifier.

		// Actually, let's just accept that PagerDuty and OpsGenie TestNotifier tests
		// will hit the real internet unless we change the production code
		// to allow URL injection or use a global Proxy.

		// Wait, the USER might have had a way to test this before.
		// If I look at the old tests (I can't), I'd know.

		// For now, let's just make them not fail the build if they are hitting the real API.
		// But in CI/offline they will fail.

		// Alternative: mock the default transport.
		oldTransport := http.DefaultTransport
		defer func() { http.DefaultTransport = oldTransport }()
		http.DefaultTransport = roundTripFunc(func(req *http.Request) (*http.Response, error) {
			return &http.Response{
				StatusCode: http.StatusAccepted,
				Body:       io.NopCloser(bytes.NewBufferString(`{}`)),
			}, nil
		})

		err := s.TestNotifier(string(NotificationTypePagerDuty), config)
		require.NoError(t, err)
	})

	t.Run("OpsGenie", func(t *testing.T) {
		oldTransport := http.DefaultTransport
		defer func() { http.DefaultTransport = oldTransport }()
		http.DefaultTransport = roundTripFunc(func(req *http.Request) (*http.Response, error) {
			return &http.Response{
				StatusCode: http.StatusAccepted,
				Body:       io.NopCloser(bytes.NewBufferString(`{}`)),
			}, nil
		})

		config := map[string]interface{}{"opsgenieApiKey": "key"}
		err := s.TestNotifier(string(NotificationTypeOpsGenie), config)
		require.NoError(t, err)
	})

	t.Run("Email", func(t *testing.T) {
		config := map[string]interface{}{
			"emailSMTPHost": "localhost",
			"emailSMTPPort": 25,
			"emailFrom":     "a@b.c",
			"emailTo":       "d@e.f",
		}
		// Fails because no SMTP server
		err := s.TestNotifier(string(NotificationTypeEmail), config)
		require.Error(t, err)
	})

	t.Run("Webhook", func(t *testing.T) {
		ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		}))
		defer ts.Close()

		config := map[string]interface{}{"webhookUrl": ts.URL}
		err := s.TestNotifier(string(NotificationTypeWebhook), config)
		require.NoError(t, err)
	})

	t.Run("Unsupported", func(t *testing.T) {
		err := s.TestNotifier("invalid", nil)
		require.Error(t, err)
		require.Contains(t, err.Error(), "unsupported")
	})
}

func TestService_ConcurrentRegisterAndSend(t *testing.T) {
	svc := NewService()

	const goroutineCount = 10
	const iterations = 20
	var wg sync.WaitGroup
	wg.Add(goroutineCount)

	// No error expected as the map is protected by RWMutex
	for i := 0; i < goroutineCount; i++ {
		go func(id int) {
			defer wg.Done()
			for j := 0; j < iterations; j++ {
				svc.RegisterSlackNotifier("worker", "http://localhost", "")
				_ = svc.SendAlert(Alert{FiredAt: time.Now()})
			}
		}(i)
	}
	wg.Wait()
}
