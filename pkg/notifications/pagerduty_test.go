package notifications

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestPagerDutyNotifier_Send(t *testing.T) {
	tests := []struct {
		name        string
		alert       Alert
		wantAction  string
		wantSummary string
	}{
		{
			name: "trigger critical alert",
			alert: Alert{
				ID:       "alert-1",
				RuleID:   "rule-1",
				RuleName: "High CPU",
				Severity: SeverityCritical,
				Status:   "firing",
				Message:  "CPU > 90%",
				Cluster:  "prod",
				FiredAt:  time.Now(),
			},
			wantAction:  "trigger",
			wantSummary: "[critical] High CPU — CPU > 90%",
		},
		{
			name: "resolve alert",
			alert: Alert{
				ID:      "alert-1",
				RuleID:  "rule-1",
				Status:  "resolved",
				Cluster: "prod",
				FiredAt: time.Now(),
			},
			wantAction: "resolve",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			var captured pagerdutyEvent
			notifier := NewPagerDutyNotifier("test-key")
			notifier.HTTPClient.Transport = roundTripFunc(func(req *http.Request) (*http.Response, error) {
				require.Equal(t, "POST", req.Method)
				require.Equal(t, "https://events.pagerduty.com/v2/enqueue", req.URL.String())

				body, err := io.ReadAll(req.Body)
				require.NoError(t, err)
				require.NoError(t, json.Unmarshal(body, &captured))

				return &http.Response{
					StatusCode: http.StatusAccepted,
					Body:       io.NopCloser(bytes.NewBufferString(`{"status":"success","message":"Event processed","dedup_key":"abc"}`)),
				}, nil
			})

			err := notifier.Send(tc.alert)
			require.NoError(t, err)

			require.Equal(t, "test-key", captured.RoutingKey)
			require.Equal(t, tc.wantAction, captured.EventAction)
			if tc.wantAction == "trigger" {
				require.NotNil(t, captured.Payload)
				require.Equal(t, tc.wantSummary, captured.Payload.Summary)
				require.Equal(t, "critical", captured.Payload.Severity)
			}
		})
	}
}

func TestPagerDuty_Send_UsesFallbackWhenAllEmpty(t *testing.T) {
	// (#8389)
	var captured pagerdutyEvent
	notifier := NewPagerDutyNotifier("test-key")
	notifier.HTTPClient.Transport = roundTripFunc(func(req *http.Request) (*http.Response, error) {
		body, _ := io.ReadAll(req.Body)
		json.Unmarshal(body, &captured)
		return &http.Response{
			StatusCode: http.StatusAccepted,
			Body:       io.NopCloser(bytes.NewBufferString(`{}`)),
		}, nil
	})

	// All identity fields empty
	alert := Alert{Message: "critical error", FiredAt: time.Now()}
	err := notifier.Send(alert)
	require.NoError(t, err)

	require.NotEmpty(t, captured.DedupKey)
	require.Contains(t, captured.DedupKey, "fallback-")
}

func TestPagerDutyNotifier_EmptyRoutingKey(t *testing.T) {
	notifier := NewPagerDutyNotifier("")
	err := notifier.Send(Alert{})
	require.Error(t, err)
	require.Contains(t, err.Error(), "routing key not configured")
}

func TestPagerDutyNotifier_Helpers(t *testing.T) {
	p := &PagerDutyNotifier{}
	require.Equal(t, "critical", p.mapSeverity(SeverityCritical))
	require.Equal(t, "warning", p.mapSeverity(SeverityWarning))
	require.Equal(t, "info", p.mapSeverity(SeverityInfo))
	require.Equal(t, "info", p.mapSeverity("unknown"))
}

func TestPagerDuty_FallbackDedupKey(t *testing.T) {
	firedAt := time.Now()
	a1 := Alert{Message: "msg1", FiredAt: firedAt}
	a2 := Alert{Message: "msg2", FiredAt: firedAt}

	key1 := fallbackDedupKey(a1)
	key2 := fallbackDedupKey(a2)

	require.NotEqual(t, key1, key2)
	require.Equal(t, key1, fallbackDedupKey(a1))
}
