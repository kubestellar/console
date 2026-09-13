package notifications

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestSlackNotifier_Send(t *testing.T) {
	tests := []struct {
		name         string
		alert        Alert
		channel      string
		wantColor    string
		wantUsername string
		wantEmoji    string
	}{
		{
			name: "critical alert",
			alert: Alert{
				RuleName: "High CPU",
				Severity: SeverityCritical,
				Status:   "firing",
				Message:  "CPU is at 95%",
				FiredAt:  time.Now(),
			},
			channel:      "#alerts",
			wantColor:    "danger",
			wantUsername: "KubeStellar Console",
			wantEmoji:    ":rotating_light:",
		},
		{
			name: "info alert",
			alert: Alert{
				RuleName: "System Update",
				Severity: SeverityInfo,
				Status:   "resolved",
				Message:  "Update complete",
				FiredAt:  time.Now(),
			},
			channel:      "",
			wantColor:    "good",
			wantUsername: "KubeStellar Console",
			wantEmoji:    ":information_source:",
		},
		{
			name: "warning alert",
			alert: Alert{
				RuleName: "High Memory",
				Severity: SeverityWarning,
				Status:   "firing",
				Message:  "Memory is at 85%",
				FiredAt:  time.Now(),
			},
			channel:      "#ops",
			wantColor:    "warning",
			wantUsername: "KubeStellar Console",
			wantEmoji:    ":warning:",
		},
		{
			// Exercises the three optional-field append branches in Send:
			// Cluster, Namespace, and Resource. Without this, Send stays
			// on the two-field fast path and lines 80-101 are unhit.
			name: "critical alert with cluster/namespace/resource populated",
			alert: Alert{
				RuleName:     "PodCrashLooping",
				Severity:     SeverityCritical,
				Status:       "firing",
				Message:      "Restart backoff exceeded",
				Cluster:      "prod-east-1",
				Namespace:    "payments",
				Resource:     "checkout-api",
				ResourceKind: "Deployment",
				FiredAt:      time.Now(),
			},
			channel:      "#prod-alerts",
			wantColor:    "danger",
			wantUsername: "KubeStellar Console",
			wantEmoji:    ":rotating_light:",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			var captured slackMessage
			ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				body, err := io.ReadAll(r.Body)
				require.NoError(t, err)
				require.NoError(t, json.Unmarshal(body, &captured))
				w.WriteHeader(http.StatusOK)
			}))
			defer ts.Close()

			notifier := NewSlackNotifier(ts.URL, tc.channel)
			err := notifier.Send(tc.alert)
			require.NoError(t, err)

			require.Equal(t, tc.wantUsername, captured.Username)
			require.Equal(t, tc.wantEmoji, captured.IconEmoji)
			require.Len(t, captured.Attachments, 1)
			require.Equal(t, tc.wantColor, captured.Attachments[0].Color)
			require.Equal(t, tc.alert.RuleName, captured.Attachments[0].Title)
			require.Equal(t, tc.alert.Message, captured.Attachments[0].Text)

			if tc.channel != "" {
				require.Equal(t, tc.channel, captured.Channel)
			}

			// When Cluster/Namespace/Resource are populated on the
			// alert, Send appends one slackAttachField per non-empty
			// value; verify each surfaces in the captured payload.
			fieldTitles := make([]string, 0, len(captured.Attachments[0].Fields))
			for _, f := range captured.Attachments[0].Fields {
				fieldTitles = append(fieldTitles, f.Title)
			}
			if tc.alert.Cluster != "" {
				require.Contains(t, fieldTitles, "Cluster")
			} else {
				require.NotContains(t, fieldTitles, "Cluster")
			}
			if tc.alert.Namespace != "" {
				require.Contains(t, fieldTitles, "Namespace")
			} else {
				require.NotContains(t, fieldTitles, "Namespace")
			}
			if tc.alert.Resource != "" {
				require.Contains(t, fieldTitles, "Resource")
			} else {
				require.NotContains(t, fieldTitles, "Resource")
			}
		})
	}
}

func TestSlackNotifier_Send_Error(t *testing.T) {
	t.Run("empty webhook URL", func(t *testing.T) {
		notifier := NewSlackNotifier("", "")
		err := notifier.Send(Alert{})
		require.Error(t, err)
		require.Contains(t, err.Error(), "webhook URL not configured")
	})

	t.Run("server error", func(t *testing.T) {
		ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusInternalServerError)
		}))
		defer ts.Close()

		notifier := NewSlackNotifier(ts.URL, "")
		err := notifier.Send(Alert{FiredAt: time.Now()})
		require.Error(t, err)
		require.Contains(t, err.Error(), "slack API returned status 500")
	})
}

func TestSlackNotifier_Test(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer ts.Close()

	notifier := NewSlackNotifier(ts.URL, "")
	err := notifier.Test()
	require.NoError(t, err)
}

func TestSlackNotifier_Helpers(t *testing.T) {
	s := &SlackNotifier{}
	require.Equal(t, "danger", s.getSeverityColor(SeverityCritical))
	require.Equal(t, "warning", s.getSeverityColor(SeverityWarning))
	require.Equal(t, "good", s.getSeverityColor(SeverityInfo))
	require.Equal(t, "#808080", s.getSeverityColor("unknown"))

	require.Equal(t, ":rotating_light:", s.getSeverityEmoji(SeverityCritical))
	require.Equal(t, ":warning:", s.getSeverityEmoji(SeverityWarning))
	require.Equal(t, ":information_source:", s.getSeverityEmoji(SeverityInfo))
	require.Equal(t, ":bell:", s.getSeverityEmoji("unknown"))
}
