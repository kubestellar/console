package agent

import (
	"testing"

	"k8s.io/apimachinery/pkg/runtime/schema"
)

func TestKagentGVRsNonEmpty(t *testing.T) {
	// All kagent GVR delegations should resolve to non-empty GroupVersionResource
	gvrs := map[string]schema.GroupVersionResource{
		"agentGVR":               agentGVR,
		"modelConfigGVR":         modelConfigGVR,
		"modelProviderConfigGVR": modelProviderConfigGVR,
		"toolServerGVR":          toolServerGVR,
		"remoteMCPServerGVR":     remoteMCPServerGVR,
		"memoryGVR":              memoryGVR,
	}

	for name, gvr := range gvrs {
		t.Run(name, func(t *testing.T) {
			if gvr.Group == "" {
				t.Errorf("%s has empty Group", name)
			}
			if gvr.Version == "" {
				t.Errorf("%s has empty Version", name)
			}
			if gvr.Resource == "" {
				t.Errorf("%s has empty Resource", name)
			}
		})
	}
}

func TestKagentTypeAliases(t *testing.T) {
	// Verify type aliases compile and can hold zero values
	var agent kagentCRDAgent
	if agent.Name != "" {
		t.Error("zero-value kagentCRDAgent should have empty Name")
	}

	var tool kagentCRDTool
	_ = tool

	var model kagentCRDModel
	_ = model

	var memory kagentCRDMemory
	_ = memory

	var iAgent kagentiAgent
	_ = iAgent

	var build kagentiBuild
	_ = build

	var card kagentiCard
	_ = card

	var iTool kagentiTool
	_ = iTool
}
