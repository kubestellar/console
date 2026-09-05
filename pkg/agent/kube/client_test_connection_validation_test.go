package kube

import (
	"strings"
	"testing"

	"k8s.io/client-go/tools/clientcmd/api"
)

// These tests target the input-validation branches of
// KubectlProxy.TestClusterConnection that were previously uncovered:
//   - empty ServerURL rejection
//   - unknown authType rejection
//   - empty authType rejection
//   - invalid base64 in certData, keyData, and caData
//   - certificate authType with valid decodable data (unreachable server)
//
// Each branch returns a deterministic result (either err != nil or a
// TestConnectionResult with Reachable=false and a specific Error string),
// so they can be exercised without any real Kubernetes server.
func TestKubectlProxy_TestClusterConnection_ValidationBranches(t *testing.T) {
	proxy := &KubectlProxy{
		kubeconfig: "/tmp/fake-config",
		config:     &api.Config{},
	}

	t.Run("empty serverUrl returns error", func(t *testing.T) {
		_, err := proxy.TestClusterConnection(TestConnectionRequest{
			AuthType: "token",
			Token:    "t",
		})
		if err == nil || !strings.Contains(err.Error(), "serverUrl is required") {
			t.Fatalf("expected serverUrl error, got %v", err)
		}
	})

	t.Run("empty authType returns error", func(t *testing.T) {
		_, err := proxy.TestClusterConnection(TestConnectionRequest{
			ServerURL: "https://example.com",
		})
		if err == nil || !strings.Contains(err.Error(), "authType is required") {
			t.Fatalf("expected authType-required error, got %v", err)
		}
	})

	t.Run("unknown authType returns error", func(t *testing.T) {
		_, err := proxy.TestClusterConnection(TestConnectionRequest{
			ServerURL: "https://example.com",
			AuthType:  "oauth2",
		})
		if err == nil || !strings.Contains(err.Error(), "unsupported authType") {
			t.Fatalf("expected unsupported-authType error, got %v", err)
		}
	})

	t.Run("invalid certData base64 returns unreachable with specific error", func(t *testing.T) {
		result, err := proxy.TestClusterConnection(TestConnectionRequest{
			ServerURL: "https://example.com",
			AuthType:  "certificate",
			CertData:  "!!!not-base64!!!",
			KeyData:   "",
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if result == nil || result.Reachable {
			t.Fatalf("expected unreachable result, got %+v", result)
		}
		if result.Error != "invalid certData base64" {
			t.Errorf("expected 'invalid certData base64', got %q", result.Error)
		}
	})

	t.Run("invalid keyData base64 returns unreachable with specific error", func(t *testing.T) {
		result, err := proxy.TestClusterConnection(TestConnectionRequest{
			ServerURL: "https://example.com",
			AuthType:  "certificate",
			CertData:  "", // skip cert arm
			KeyData:   "!!!not-base64!!!",
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if result == nil || result.Reachable {
			t.Fatalf("expected unreachable result, got %+v", result)
		}
		if result.Error != "invalid keyData base64" {
			t.Errorf("expected 'invalid keyData base64', got %q", result.Error)
		}
	})

	t.Run("invalid caData base64 returns unreachable with specific error", func(t *testing.T) {
		result, err := proxy.TestClusterConnection(TestConnectionRequest{
			ServerURL: "https://example.com",
			AuthType:  "token",
			Token:     "t",
			CAData:    "!!!not-base64!!!",
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if result == nil || result.Reachable {
			t.Fatalf("expected unreachable result, got %+v", result)
		}
		if result.Error != "invalid caData base64" {
			t.Errorf("expected 'invalid caData base64', got %q", result.Error)
		}
	})

	t.Run("certificate authType with valid base64 falls through to connection attempt", func(t *testing.T) {
		// Valid (but not real cryptographic) base64 for cert + key. This
		// takes both `CertData != ""` and `KeyData != ""` TRUE branches
		// through the base64-decode step; the subsequent connection
		// attempt against an unreachable port then fails with a network
		// error rather than any of the validation errors above.
		result, err := proxy.TestClusterConnection(TestConnectionRequest{
			ServerURL:     "https://127.0.0.1:1",
			AuthType:      "certificate",
			CertData:      "Zm9v", // "foo"
			KeyData:       "YmFy", // "bar"
			SkipTLSVerify: true,
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if result == nil || result.Reachable {
			t.Fatalf("expected unreachable result, got %+v", result)
		}
		// The error path is either NewForConfig failure or Discovery
		// failure — either is fine; the important thing is neither
		// base64-decode branch fired.
		if strings.Contains(result.Error, "invalid certData") ||
			strings.Contains(result.Error, "invalid keyData") {
			t.Errorf("valid base64 should not trigger decode-error branches, got %q", result.Error)
		}
	})
}
