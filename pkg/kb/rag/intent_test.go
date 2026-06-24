package rag

import (
	"testing"
)

func TestDetectIntent_InstallVerbs(t *testing.T) {
	cases := []string{
		"install prometheus",
		"set up monitoring",
		"deploy linkerd",
		"configure ingress",
		"enable cert-manager",
		"bootstrap the cluster",
	}
	for _, q := range cases {
		in := detectIntent(q)
		if !in.install {
			t.Errorf("expected install intent for %q", q)
		}
	}
}

func TestDetectIntent_FixVerbs(t *testing.T) {
	cases := []string{
		"fix RBAC error",
		"error deploying pod",
		"troubleshoot networking",
		"debug crash loop",
		"resolve permission denied",
		"pods not working",
		"cannot pull image",
	}
	for _, q := range cases {
		in := detectIntent(q)
		if !in.fix {
			t.Errorf("expected fix intent for %q", q)
		}
	}
}

func TestDetectIntent_BothIntents(t *testing.T) {
	in := detectIntent("install cert-manager but it fails with error")
	if !in.install || !in.fix {
		t.Fatalf("expected both intents: install=%v, fix=%v", in.install, in.fix)
	}
}

func TestDetectIntent_NoIntent(t *testing.T) {
	in := detectIntent("what projects are available")
	if in.install || in.fix {
		t.Fatalf("expected no intent: install=%v, fix=%v", in.install, in.fix)
	}
}

func TestDetectIntent_CaseInsensitive(t *testing.T) {
	in := detectIntent("INSTALL PROMETHEUS")
	if !in.install {
		t.Fatal("should be case insensitive")
	}
}

func TestQueryIntentBoost_InstallMission(t *testing.T) {
	in := queryIntent{install: true}
	d := Document{MissionClass: "install", Category: "cncf-install"}
	b := in.boost(d)
	if b <= 1.0 {
		t.Fatalf("install intent should boost install mission, got %f", b)
	}
	expected := boostInstallMission * boostInstallCategory
	if b != expected {
		t.Fatalf("expected %f, got %f", expected, b)
	}
}

func TestQueryIntentBoost_DemoteGeneratedFixer(t *testing.T) {
	in := queryIntent{install: true}
	d := Document{MissionClass: "fixer", Category: "cncf-generated"}
	b := in.boost(d)
	if b >= 1.0 {
		t.Fatalf("install intent should demote generated fixer, got %f", b)
	}
}

func TestQueryIntentBoost_FixerMission(t *testing.T) {
	in := queryIntent{fix: true}
	d := Document{MissionClass: "fixer", Category: "troubleshooting"}
	b := in.boost(d)
	expected := boostFixerMission * boostFixCategory
	if b != expected {
		t.Fatalf("expected %f, got %f", expected, b)
	}
}

func TestQueryIntentBoost_NoIntent(t *testing.T) {
	in := queryIntent{}
	d := Document{MissionClass: "install", Category: "cncf-install"}
	if b := in.boost(d); b != 1.0 {
		t.Fatalf("no intent should return 1.0, got %f", b)
	}
}

func TestExpandQuery_AddsMonitoringSynonyms(t *testing.T) {
	expanded := expandQuery("monitoring cluster")
	// Should contain "prometheus" or "grafana" from conceptExpansions
	toks := tokenize(expanded)
	found := map[string]bool{}
	for _, tok := range toks {
		found[tok] = true
	}
	if !found["prometheus"] {
		t.Fatal("expected 'prometheus' in expansion of 'monitoring'")
	}
	if !found["grafana"] {
		t.Fatal("expected 'grafana' in expansion of 'monitoring'")
	}
}

func TestExpandQuery_PreservesOriginalTokens(t *testing.T) {
	expanded := expandQuery("monitoring cluster health")
	toks := tokenize(expanded)
	found := map[string]bool{}
	for _, tok := range toks {
		found[tok] = true
	}
	if !found["cluster"] {
		t.Fatal("original token 'cluster' should be preserved")
	}
	if !found["health"] {
		t.Fatal("original token 'health' should be preserved")
	}
}

func TestExpandQuery_NoExpansionForUnknown(t *testing.T) {
	input := "kubernetes frobnicate"
	expanded := expandQuery(input)
	// "frobnicate" has no expansion entry, output should contain only original tokens
	toks := tokenize(expanded)
	found := map[string]bool{}
	for _, tok := range toks {
		found[tok] = true
	}
	if !found["kubernetes"] {
		t.Fatal("expected 'kubernetes' preserved")
	}
	if !found["frobnicate"] {
		t.Fatal("expected 'frobnicate' preserved")
	}
}

func TestExpandQuery_EmptyInput(t *testing.T) {
	expanded := expandQuery("")
	if expanded != "" {
		t.Fatalf("empty input should produce empty output, got %q", expanded)
	}
}
