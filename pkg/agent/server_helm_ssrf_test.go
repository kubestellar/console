package agent

import (
	"testing"
)

func TestValidateHelmOCIChartRef_PublicRegistry(t *testing.T) {
	// Non-OCI refs should pass without any network check.
	if err := validateHelmOCIChartRef("bitnami/nginx"); err != nil {
		t.Fatalf("expected nil for non-OCI ref, got %v", err)
	}
}

func TestValidateHelmOCIChartRef_PrivateIP(t *testing.T) {
	tests := []struct {
		name  string
		chart string
	}{
		{"loopback", "oci://127.0.0.1/chart:1.0"},
		{"private-10", "oci://10.0.0.1/chart:1.0"},
		{"private-172", "oci://172.16.0.1/chart:1.0"},
		{"private-192", "oci://192.168.1.1/chart:1.0"},
		{"link-local", "oci://169.254.169.254/chart:1.0"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			err := validateHelmOCIChartRef(tc.chart)
			if err == nil {
				t.Fatalf("expected error for private IP chart ref %q, got nil", tc.chart)
			}
		})
	}
}

func TestValidateHelmOCIChartRef_EmptyHost(t *testing.T) {
	err := validateHelmOCIChartRef("oci:///chart:1.0")
	if err == nil {
		t.Fatal("expected error for OCI ref with empty host")
	}
}
