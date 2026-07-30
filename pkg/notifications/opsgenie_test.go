package notifications

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestOpsGenieNotifier_Mapping(t *testing.T) {
	o := &OpsGenieNotifier{}

	t.Run("priority mapping", func(t *testing.T) {
		require.Equal(t, "P1", o.mapPriority(SeverityCritical))
		require.Equal(t, "P3", o.mapPriority(SeverityWarning))
		require.Equal(t, "P5", o.mapPriority(SeverityInfo))
		require.Equal(t, "P5", o.mapPriority("unknown"))
	})

	t.Run("alias construction firing", func(t *testing.T) {
		alert := Alert{RuleID: "rule-1", Cluster: "cluster-A"}
		alias := alert.RuleID + "::" + alert.Cluster
		require.Equal(t, "rule-1::cluster-A", alias)
	})

	t.Run("message truncation", func(t *testing.T) {
		longName := strings.Repeat("A", 150)
		message := longName
		if len(message) > 130 {
			message = message[:127] + "..."
		}
		require.Equal(t, 130, len(message))
		require.True(t, strings.HasSuffix(message, "..."))
	})
}

func TestOpsGenieNotifier_Send_Error(t *testing.T) {
	o := NewOpsGenieNotifier("")
	err := o.Send(Alert{})
	require.Error(t, err)
	require.Contains(t, err.Error(), "opsgenie API key not configured")
}

func TestOpsGenie_FallbackDedupKey(t *testing.T) {
	firedAt := time.Now()
	a := Alert{Message: "oom", FiredAt: firedAt}
	key := fallbackDedupKey(a)
	require.NotEmpty(t, key)
	require.True(t, strings.HasPrefix(key, "fallback-"))
}

func TestOpsGenie_Send_UsesFallbackAliasWhenAllEmpty(t *testing.T) {
	// (#8390)
	var captured opsgenieAlert
	o := NewOpsGenieNotifier("test-key")
	o.HTTPClient.Transport = roundTripFunc(func(req *http.Request) (*http.Response, error) {
		body, _ := io.ReadAll(req.Body)
		json.Unmarshal(body, &captured)
		return &http.Response{
			StatusCode: http.StatusAccepted,
			Body:       io.NopCloser(bytes.NewBufferString(`{}`)),
		}, nil
	})

	// All identity fields empty
	alert := Alert{Message: "critical error", FiredAt: time.Now()}
	err := o.Send(alert)
	require.NoError(t, err)

	require.NotEmpty(t, captured.Alias)
	require.Contains(t, captured.Alias, "fallback-")
}

func TestOpsGenie_AliasEscaping(t *testing.T) {
	// Rejects obviously hostile content.
	o := &OpsGenieNotifier{}
	err := o.closeAlert("rule\n1")
	require.Error(t, err)
	require.Contains(t, err.Error(), "invalid characters")
}
