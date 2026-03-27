package agent

import (
	"context"
	"testing"
	"time"
)

func TestAntigravityProvider_Handshake_NotInstalled(t *testing.T) {
	p := &AntigravityProvider{} // No cliPath set

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	result := p.Handshake(ctx)

	if result.Ready {
		t.Error("Expected Ready=false when CLI is not installed")
	}
	if result.State != "failed" {
		t.Errorf("Expected state='failed', got '%s'", result.State)
	}
	if len(result.Prerequisites) == 0 {
		t.Error("Expected prerequisites to be listed when CLI is not found")
	}
	if result.Message == "" {
		t.Error("Expected a non-empty message explaining the failure")
	}
}

func TestAntigravityProvider_Handshake_InvalidPath(t *testing.T) {
	p := &AntigravityProvider{
		cliPath: "/nonexistent/path/to/antigravity",
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	result := p.Handshake(ctx)

	if result.Ready {
		t.Error("Expected Ready=false when CLI path is invalid")
	}
	if result.State != "failed" {
		t.Errorf("Expected state='failed', got '%s'", result.State)
	}
	if result.CliPath == "" {
		t.Error("Expected CliPath to be set even when handshake fails")
	}
	if len(result.Prerequisites) == 0 {
		t.Error("Expected prerequisites to help the user troubleshoot")
	}
}

func TestAntigravityProvider_HandshakeInterface(t *testing.T) {
	// Verify AntigravityProvider implements HandshakeProvider
	var _ HandshakeProvider = &AntigravityProvider{}
}

func TestAntigravityProvider_HandshakeResult_Fields(t *testing.T) {
	// Test that HandshakeResult has the expected fields
	r := &HandshakeResult{
		Ready:         true,
		State:         "connected",
		Message:       "test message",
		Prerequisites: []string{"prereq1"},
		Version:       "1.0.0",
		CliPath:       "/usr/bin/ag",
	}

	if !r.Ready {
		t.Error("Expected Ready=true")
	}
	if r.State != "connected" {
		t.Errorf("Expected State='connected', got '%s'", r.State)
	}
	if r.Version != "1.0.0" {
		t.Errorf("Expected Version='1.0.0', got '%s'", r.Version)
	}
}
