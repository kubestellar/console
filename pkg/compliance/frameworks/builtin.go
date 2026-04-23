package frameworks

// Registry holds all known frameworks keyed by ID.
var Registry = map[string]Framework{
	"pci-dss-4.0": PCIDSS4(),
	"soc2-type2":  SOC2Type2(),
}

// PCIDSS4 returns the PCI-DSS 4.0 compliance framework mapped to
// concrete Kubernetes checks.
func PCIDSS4() Framework {
	return Framework{
		ID:          "pci-dss-4.0",
		Name:        "PCI-DSS 4.0",
		Version:     "4.0",
		Description: "Payment Card Industry Data Security Standard — requirements for organizations that handle cardholder data.",
		Category:    "financial",
		BuiltIn:     true,
		Controls: []Control{
			{
				ID:          "pci-1",
				Title:       "Requirement 1: Network Segmentation",
				Description: "Install and maintain network security controls.",
				Severity:    SeverityCritical,
				Category:    "Network Security",
				Checks: []Check{
					{ID: "pci-1.1", Name: "NetworkPolicy coverage", Description: "All namespaces with cardholder data must have NetworkPolicies defined.", CheckType: "network_policy"},
					{ID: "pci-1.2", Name: "Default deny ingress", Description: "Default deny ingress policies should exist in sensitive namespaces.", CheckType: "network_policy", Params: map[string]string{"require_default_deny": "true"}},
				},
			},
			{
				ID:          "pci-2",
				Title:       "Requirement 2: Secure Configurations",
				Description: "Apply secure configurations to all system components.",
				Severity:    SeverityHigh,
				Category:    "Configuration",
				Checks: []Check{
					{ID: "pci-2.1", Name: "Pod security standards", Description: "Pods must not run as privileged or as root.", CheckType: "pod_security"},
					{ID: "pci-2.2", Name: "No default credentials", Description: "Default ServiceAccount tokens should not be auto-mounted.", CheckType: "pod_security", Params: map[string]string{"check_sa_automount": "true"}},
				},
			},
			{
				ID:          "pci-3",
				Title:       "Requirement 3: Protect Stored Data",
				Description: "Protect stored account data with encryption.",
				Severity:    SeverityCritical,
				Category:    "Data Protection",
				Checks: []Check{
					{ID: "pci-3.1", Name: "Encryption at rest", Description: "etcd encryption configuration must be enabled.", CheckType: "encryption_at_rest"},
				},
			},
			{
				ID:          "pci-6",
				Title:       "Requirement 6: Secure Software",
				Description: "Develop and maintain secure systems and software.",
				Severity:    SeverityHigh,
				Category:    "Vulnerability Management",
				Checks: []Check{
					{ID: "pci-6.1", Name: "Image vulnerability scanning", Description: "Container images must be scanned for known CVEs.", CheckType: "image_scanning"},
					{ID: "pci-6.2", Name: "No critical CVEs", Description: "No running images should have critical-severity CVEs.", CheckType: "image_scanning", Params: map[string]string{"max_severity": "critical"}},
				},
			},
			{
				ID:          "pci-7",
				Title:       "Requirement 7: Restrict Access",
				Description: "Restrict access to system components and cardholder data by business need to know.",
				Severity:    SeverityCritical,
				Category:    "Access Control",
				Checks: []Check{
					{ID: "pci-7.1", Name: "RBAC least privilege", Description: "ClusterRoleBindings should not grant cluster-admin to non-system accounts.", CheckType: "rbac_least_privilege"},
					{ID: "pci-7.2", Name: "No wildcard RBAC", Description: "Roles should not use wildcard (*) verbs or resources.", CheckType: "rbac_least_privilege", Params: map[string]string{"check_wildcards": "true"}},
				},
			},
			{
				ID:          "pci-8",
				Title:       "Requirement 8: Identity Management",
				Description: "Identify users and authenticate access to system components.",
				Severity:    SeverityHigh,
				Category:    "Authentication",
				Checks: []Check{
					{ID: "pci-8.1", Name: "Auth provider configured", Description: "An external authentication provider (OIDC, OAuth) must be configured.", CheckType: "auth_provider"},
				},
			},
			{
				ID:          "pci-10",
				Title:       "Requirement 10: Logging and Monitoring",
				Description: "Log and monitor all access to system components and cardholder data.",
				Severity:    SeverityHigh,
				Category:    "Audit & Monitoring",
				Checks: []Check{
					{ID: "pci-10.1", Name: "Audit logging enabled", Description: "Kubernetes audit logging must be configured and active.", CheckType: "audit_logging"},
				},
			},
			{
				ID:          "pci-11",
				Title:       "Requirement 11: Security Testing",
				Description: "Test security of systems and networks regularly.",
				Severity:    SeverityMedium,
				Category:    "Security Testing",
				Checks: []Check{
					{ID: "pci-11.1", Name: "Runtime security monitoring", Description: "A runtime security tool (Falco, Tetragon) should be active.", CheckType: "runtime_security"},
				},
			},
		},
	}
}

// SOC2Type2 returns the SOC 2 Type II compliance framework.
func SOC2Type2() Framework {
	return Framework{
		ID:          "soc2-type2",
		Name:        "SOC 2 Type II",
		Version:     "2024",
		Description: "Service Organization Controls — trust services criteria for security, availability, processing integrity, confidentiality, and privacy.",
		Category:    "operational",
		BuiltIn:     true,
		Controls: []Control{
			{
				ID:          "cc6.1",
				Title:       "CC6.1: Logical Access Security",
				Description: "The entity implements logical access security software, infrastructure, and architectures.",
				Severity:    SeverityCritical,
				Category:    "Access Control",
				Checks: []Check{
					{ID: "cc6.1.1", Name: "RBAC enabled", Description: "Role-based access control must be enforced.", CheckType: "rbac_least_privilege"},
					{ID: "cc6.1.2", Name: "NetworkPolicy segmentation", Description: "Network segmentation via NetworkPolicies.", CheckType: "network_policy"},
				},
			},
			{
				ID:          "cc6.3",
				Title:       "CC6.3: Role-Based Access",
				Description: "The entity authorizes, modifies, or removes access to data and other assets based on roles.",
				Severity:    SeverityHigh,
				Category:    "Access Control",
				Checks: []Check{
					{ID: "cc6.3.1", Name: "Least privilege RBAC", Description: "No overly broad ClusterRoleBindings.", CheckType: "rbac_least_privilege"},
					{ID: "cc6.3.2", Name: "ServiceAccount restrictions", Description: "Default ServiceAccount should not have elevated privileges.", CheckType: "pod_security", Params: map[string]string{"check_sa_automount": "true"}},
				},
			},
			{
				ID:          "cc7.2",
				Title:       "CC7.2: System Monitoring",
				Description: "The entity monitors system components and the operation of those components for anomalies.",
				Severity:    SeverityHigh,
				Category:    "Monitoring",
				Checks: []Check{
					{ID: "cc7.2.1", Name: "Runtime monitoring active", Description: "A runtime security monitor (Falco) should be running.", CheckType: "runtime_security"},
					{ID: "cc7.2.2", Name: "Audit logging active", Description: "Kubernetes API audit logging must be enabled.", CheckType: "audit_logging"},
				},
			},
			{
				ID:          "cc8.1",
				Title:       "CC8.1: Change Management",
				Description: "The entity authorizes, designs, develops, configures, documents, tests, approves, and implements changes to infrastructure and software.",
				Severity:    SeverityMedium,
				Category:    "Change Management",
				Checks: []Check{
					{ID: "cc8.1.1", Name: "Image provenance", Description: "Container images should come from trusted registries.", CheckType: "image_scanning"},
					{ID: "cc8.1.2", Name: "Pod security enforcement", Description: "Pod security standards enforced to prevent untested configs.", CheckType: "pod_security"},
				},
			},
		},
	}
}
