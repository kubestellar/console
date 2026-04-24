package audit

// Smoke tests for the Splunk/Elastic/Syslog destination adapters (#9887).
//
// These exercise the constructor guard rails and the ErrDestinationUnsupported
// fallback path. End-to-end delivery is covered by the integration suite once
// the full export engine lands (#9643).

import (
	"context"
	"errors"
	"testing"
)

func TestSplunkRequiresURL(t *testing.T) {
	if _, err := NewSplunkDestination("", "token", nil); err == nil {
		t.Fatal("NewSplunkDestination with empty url must error")
	}
}

func TestSplunkRequiresToken(t *testing.T) {
	if _, err := NewSplunkDestination("https://splunk.example/services/collector", "", nil); err == nil {
		t.Fatal("NewSplunkDestination with empty token must error (HEC config)")
	}
}

func TestElasticRequiresURL(t *testing.T) {
	if _, err := NewElasticDestination("", "", nil); err == nil {
		t.Fatal("NewElasticDestination with empty url must error")
	}
}

func TestSyslogRequiresAddr(t *testing.T) {
	if _, err := NewSyslogDestination("udp", "", ""); err == nil {
		t.Fatal("NewSyslogDestination with empty addr must error")
	}
}

func TestRegisterDestinationFallsBackToStubOnMissingConfig(t *testing.T) {
	ResetForTest()
	t.Cleanup(ResetForTest)

	cases := []struct {
		name string
		cfg  DestinationConfig
	}{
		{
			name: "splunk without token",
			cfg:  DestinationConfig{ID: "s", Provider: ProviderSplunk, URL: "https://splunk.example"},
		},
		{
			name: "elastic without url",
			cfg:  DestinationConfig{ID: "e", Provider: ProviderElastic},
		},
		{
			name: "syslog without addr",
			cfg:  DestinationConfig{ID: "y", Provider: ProviderSyslog},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			ResetForTest()
			adapter, err := RegisterDestination(tc.cfg)
			if err != nil {
				t.Fatalf("RegisterDestination: unexpected error: %v", err)
			}
			if adapter == nil {
				t.Fatal("RegisterDestination: adapter is nil")
			}
			if err := adapter.Send(context.Background(), []PipelineEvent{{ID: "evt-1"}}); !errors.Is(err, ErrDestinationUnsupported) {
				t.Fatalf("Send: want ErrDestinationUnsupported, got %v", err)
			}
		})
	}
}

func TestRegisterDestinationSplunkWithFullConfig(t *testing.T) {
	ResetForTest()
	t.Cleanup(ResetForTest)

	adapter, err := RegisterDestination(DestinationConfig{
		ID:       "splunk-prod",
		Name:     "Splunk Prod",
		Provider: ProviderSplunk,
		URL:      "https://splunk.example",
		Token:    "abc123",
	})
	if err != nil {
		t.Fatalf("RegisterDestination: %v", err)
	}
	if adapter.Provider() != ProviderSplunk {
		t.Fatalf("Provider() = %q, want %q", adapter.Provider(), ProviderSplunk)
	}
	// Concrete adapter, not the stub: Send should not return the sentinel
	// unsupported error (it may fail for other reasons such as network, which
	// we do not assert on here to keep the test hermetic).
	if _, ok := adapter.(*SplunkDestination); !ok {
		t.Fatalf("adapter type = %T, want *SplunkDestination", adapter)
	}
}

func TestRegisterDestinationElasticWithURL(t *testing.T) {
	ResetForTest()
	t.Cleanup(ResetForTest)

	adapter, err := RegisterDestination(DestinationConfig{
		ID:       "elastic-prod",
		Provider: ProviderElastic,
		URL:      "https://es.example:9200",
	})
	if err != nil {
		t.Fatalf("RegisterDestination: %v", err)
	}
	if _, ok := adapter.(*ElasticDestination); !ok {
		t.Fatalf("adapter type = %T, want *ElasticDestination", adapter)
	}
}
