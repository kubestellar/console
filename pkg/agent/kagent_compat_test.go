package agent

import "testing"

func TestAgentGVR_NonEmpty(t *testing.T) {
	if agentGVR.Resource == "" {
		t.Error("agentGVR.Resource should not be empty")
	}
	if agentGVR.Group == "" {
		t.Error("agentGVR.Group should not be empty")
	}
	if agentGVR.Version == "" {
		t.Error("agentGVR.Version should not be empty")
	}
}

func TestModelConfigGVR_NonEmpty(t *testing.T) {
	if modelConfigGVR.Resource == "" {
		t.Error("modelConfigGVR.Resource should not be empty")
	}
}

func TestModelProviderConfigGVR_NonEmpty(t *testing.T) {
	if modelProviderConfigGVR.Resource == "" {
		t.Error("modelProviderConfigGVR.Resource should not be empty")
	}
}

func TestToolServerGVR_NonEmpty(t *testing.T) {
	if toolServerGVR.Resource == "" {
		t.Error("toolServerGVR.Resource should not be empty")
	}
}

func TestRemoteMCPServerGVR_NonEmpty(t *testing.T) {
	if remoteMCPServerGVR.Resource == "" {
		t.Error("remoteMCPServerGVR.Resource should not be empty")
	}
}

func TestMemoryGVR_NonEmpty(t *testing.T) {
	if memoryGVR.Resource == "" {
		t.Error("memoryGVR.Resource should not be empty")
	}
}

func TestKagentHandlers_NotNil(t *testing.T) {
	s := newTestServer(t)
	handlers := s.kagentHandlers()
	if handlers == nil {
		t.Fatal("kagentHandlers() should return non-nil *kagent.Handlers")
	}
}

func TestKagentHandlers_ContextIsServer(t *testing.T) {
	s := newTestServer(t)
	handlers := s.kagentHandlers()
	if handlers.Ctx != s {
		t.Error("kagentHandlers().Ctx should point to the owning Server")
	}
}
