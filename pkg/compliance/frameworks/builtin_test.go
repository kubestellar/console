package frameworks

import "testing"

func TestRegistry_ContainsBothFrameworks(t *testing.T) {
	if _, ok := Registry["pci-dss-4.0"]; !ok {
		t.Error("Registry missing pci-dss-4.0")
	}
	if _, ok := Registry["soc2-type2"]; !ok {
		t.Error("Registry missing soc2-type2")
	}
	if len(Registry) != 2 {
		t.Errorf("Registry has %d entries, want 2", len(Registry))
	}
}

func TestPCIDSS4_Structure(t *testing.T) {
	fw := PCIDSS4()
	if fw.ID != "pci-dss-4.0" {
		t.Errorf("ID = %q, want %q", fw.ID, "pci-dss-4.0")
	}
	if fw.Name != "PCI-DSS 4.0" {
		t.Errorf("Name = %q, want %q", fw.Name, "PCI-DSS 4.0")
	}
	if fw.Category != "financial" {
		t.Errorf("Category = %q, want %q", fw.Category, "financial")
	}
	if !fw.BuiltIn {
		t.Error("BuiltIn should be true")
	}
	if len(fw.Controls) == 0 {
		t.Fatal("PCIDSS4 has no controls")
	}
}

func TestPCIDSS4_ControlsHaveChecks(t *testing.T) {
	fw := PCIDSS4()
	for _, ctrl := range fw.Controls {
		if ctrl.ID == "" {
			t.Error("control has empty ID")
		}
		if ctrl.Title == "" {
			t.Errorf("control %s has empty Title", ctrl.ID)
		}
		if len(ctrl.Checks) == 0 {
			t.Errorf("control %s has no checks", ctrl.ID)
		}
		for _, check := range ctrl.Checks {
			if check.ID == "" {
				t.Errorf("control %s: check has empty ID", ctrl.ID)
			}
			if check.CheckType == "" {
				t.Errorf("control %s check %s: empty CheckType", ctrl.ID, check.ID)
			}
		}
	}
}

func TestPCIDSS4_UniqueControlIDs(t *testing.T) {
	fw := PCIDSS4()
	seen := make(map[string]bool)
	for _, ctrl := range fw.Controls {
		if seen[ctrl.ID] {
			t.Errorf("duplicate control ID: %s", ctrl.ID)
		}
		seen[ctrl.ID] = true
	}
}

func TestPCIDSS4_UniqueCheckIDs(t *testing.T) {
	fw := PCIDSS4()
	seen := make(map[string]bool)
	for _, ctrl := range fw.Controls {
		for _, check := range ctrl.Checks {
			if seen[check.ID] {
				t.Errorf("duplicate check ID: %s", check.ID)
			}
			seen[check.ID] = true
		}
	}
}

func TestSOC2Type2_Structure(t *testing.T) {
	fw := SOC2Type2()
	if fw.ID != "soc2-type2" {
		t.Errorf("ID = %q, want %q", fw.ID, "soc2-type2")
	}
	if fw.Name != "SOC 2 Type II" {
		t.Errorf("Name = %q, want %q", fw.Name, "SOC 2 Type II")
	}
	if fw.Category != "operational" {
		t.Errorf("Category = %q, want %q", fw.Category, "operational")
	}
	if !fw.BuiltIn {
		t.Error("BuiltIn should be true")
	}
	if len(fw.Controls) == 0 {
		t.Fatal("SOC2Type2 has no controls")
	}
}

func TestSOC2Type2_ControlsHaveChecks(t *testing.T) {
	fw := SOC2Type2()
	for _, ctrl := range fw.Controls {
		if ctrl.ID == "" {
			t.Error("control has empty ID")
		}
		if len(ctrl.Checks) == 0 {
			t.Errorf("control %s has no checks", ctrl.ID)
		}
		for _, check := range ctrl.Checks {
			if check.CheckType == "" {
				t.Errorf("control %s check %s: empty CheckType", ctrl.ID, check.ID)
			}
		}
	}
}

func TestSOC2Type2_UniqueControlIDs(t *testing.T) {
	fw := SOC2Type2()
	seen := make(map[string]bool)
	for _, ctrl := range fw.Controls {
		if seen[ctrl.ID] {
			t.Errorf("duplicate control ID: %s", ctrl.ID)
		}
		seen[ctrl.ID] = true
	}
}

func TestSOC2Type2_ValidSeverities(t *testing.T) {
	valid := map[Severity]bool{
		SeverityCritical: true,
		SeverityHigh:     true,
		SeverityMedium:   true,
		SeverityLow:      true,
	}
	fw := SOC2Type2()
	for _, ctrl := range fw.Controls {
		if !valid[ctrl.Severity] {
			t.Errorf("control %s has invalid severity %q", ctrl.ID, ctrl.Severity)
		}
	}
}

func TestPCIDSS4_ValidSeverities(t *testing.T) {
	valid := map[Severity]bool{
		SeverityCritical: true,
		SeverityHigh:     true,
		SeverityMedium:   true,
		SeverityLow:      true,
	}
	fw := PCIDSS4()
	for _, ctrl := range fw.Controls {
		if !valid[ctrl.Severity] {
			t.Errorf("control %s has invalid severity %q", ctrl.ID, ctrl.Severity)
		}
	}
}
