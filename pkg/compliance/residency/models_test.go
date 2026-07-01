package residency

import "testing"

func TestAllRegions_ContainsExpected(t *testing.T) {
	regions := AllRegions()
	expected := []Region{RegionEU, RegionUS, RegionAPAC, RegionCanada, RegionUK, RegionGlobal}

	if len(regions) != len(expected) {
		t.Fatalf("AllRegions() returned %d regions, want %d", len(regions), len(expected))
	}
	for i, r := range expected {
		if regions[i] != r {
			t.Errorf("AllRegions()[%d] = %q, want %q", i, regions[i], r)
		}
	}
}

func TestRegionLabel_KnownRegions(t *testing.T) {
	tests := []struct {
		region Region
		want   string
	}{
		{RegionEU, "European Union"},
		{RegionUS, "United States"},
		{RegionAPAC, "Asia-Pacific"},
		{RegionCanada, "Canada"},
		{RegionUK, "United Kingdom"},
		{RegionGlobal, "Global (No Restriction)"},
	}
	for _, tc := range tests {
		t.Run(string(tc.region), func(t *testing.T) {
			got := RegionLabel(tc.region)
			if got != tc.want {
				t.Errorf("RegionLabel(%q) = %q, want %q", tc.region, got, tc.want)
			}
		})
	}
}

func TestRegionLabel_UnknownRegion(t *testing.T) {
	got := RegionLabel(Region("mars"))
	if got != "mars" {
		t.Errorf("RegionLabel(unknown) = %q, want %q", got, "mars")
	}
}

func TestAllClassifications_ContainsExpected(t *testing.T) {
	classifications := AllClassifications()
	expected := []DataClassification{
		ClassEUPersonal, ClassPCI, ClassHIPAA,
		ClassFederal, ClassConfidential, ClassPublic,
	}

	if len(classifications) != len(expected) {
		t.Fatalf("AllClassifications() returned %d, want %d", len(classifications), len(expected))
	}
	for i, c := range expected {
		if classifications[i] != c {
			t.Errorf("AllClassifications()[%d] = %q, want %q", i, classifications[i], c)
		}
	}
}

func TestAllRegions_NoDuplicates(t *testing.T) {
	regions := AllRegions()
	seen := make(map[Region]bool)
	for _, r := range regions {
		if seen[r] {
			t.Errorf("duplicate region: %q", r)
		}
		seen[r] = true
	}
}

func TestAllClassifications_NoDuplicates(t *testing.T) {
	classifications := AllClassifications()
	seen := make(map[DataClassification]bool)
	for _, c := range classifications {
		if seen[c] {
			t.Errorf("duplicate classification: %q", c)
		}
		seen[c] = true
	}
}
