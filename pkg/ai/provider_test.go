package ai

import "testing"

func TestHasCapability_Chat(t *testing.T) {
	cap := CapabilityChat
	if !cap.HasCapability(CapabilityChat) {
		t.Error("expected CapabilityChat to include CapabilityChat")
	}
	if cap.HasCapability(CapabilityToolExec) {
		t.Error("expected CapabilityChat to NOT include CapabilityToolExec")
	}
}

func TestHasCapability_ToolExec(t *testing.T) {
	cap := CapabilityToolExec
	if !cap.HasCapability(CapabilityToolExec) {
		t.Error("expected CapabilityToolExec to include CapabilityToolExec")
	}
	if cap.HasCapability(CapabilityChat) {
		t.Error("expected CapabilityToolExec to NOT include CapabilityChat")
	}
}

func TestHasCapability_Combined(t *testing.T) {
	cap := CapabilityChat | CapabilityToolExec
	if !cap.HasCapability(CapabilityChat) {
		t.Error("expected combined capability to include CapabilityChat")
	}
	if !cap.HasCapability(CapabilityToolExec) {
		t.Error("expected combined capability to include CapabilityToolExec")
	}
}

func TestHasCapability_Zero(t *testing.T) {
	var cap ProviderCapability
	if cap.HasCapability(CapabilityChat) {
		t.Error("expected zero capability to NOT include CapabilityChat")
	}
	if cap.HasCapability(CapabilityToolExec) {
		t.Error("expected zero capability to NOT include CapabilityToolExec")
	}
}

func TestCapabilityValues_ArePowersOfTwo(t *testing.T) {
	// Ensure capabilities are distinct bit flags
	if CapabilityChat == CapabilityToolExec {
		t.Error("CapabilityChat and CapabilityToolExec must be distinct")
	}
	if CapabilityChat&CapabilityToolExec != 0 {
		t.Error("CapabilityChat and CapabilityToolExec must not share bits")
	}
}
