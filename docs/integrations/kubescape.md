# KubeStellar Console: Kubescape Integration Guide

The KubeStellar Console integrates with Kubescape to provide fleet-wide security posture assessment and compliance monitoring. This integration allows you to:

- Discover and view **Kubescape compliance findings** across all your managed clusters.
- Monitor **NIST, CIS, and PCI-DSS compliance** status across clusters.
- Track security control violations and remediation progress.
- View cluster security scores and recommendations across your entire platform.

## Prerequisites

- One or more Kubernetes clusters monitored by the KubeStellar Console.
- Kubescape deployed on those clusters (typically in the `kubescape` namespace).
- KubeStellar Console installed and running.

## Setup

No explicit authentication setup is required for Kubescape integration. The console uses your cluster's RBAC to discover Kubescape compliance reports.

### Required RBAC Permissions

The KubeStellar Console service account requires the following permissions to access Kubescape resources:

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: kubestellar-console-kubescape
rules:
- apiGroups: ["spdx.softwarecomposition.kubescape.io"]
  resources: ["sboms", "vulnerabilities"]
  verbs: ["get", "list", "watch"]
- apiGroups: ["kubescape.io"]
  resources: ["complianceresults", "securityriskanalysises"]
  verbs: ["get", "list", "watch"]
```

## How to View and Add Cards in the UI

The Kubescape integrations are provided as dynamic cards that can be added to any of your dashboards in the Console.

1. Navigate to your main overview dashboard at `http://localhost:8080/` (or your specific hosted Console URL).
2. Click the **Add Card** (or **+**) button at the top right of the dashboard.
3. In the component catalog, scroll down to the **Security** or **Compliance** category.
4. Select from the available views to add them to your board:
   - **Kubescape Compliance**: View compliance framework scores (NIST, CIS, PCI-DSS) across clusters.
   - **Kubescape Findings**: Monitor security control violations and remediation status.
   - **Kubescape Risk Analysis**: Track security risk scoring and recommendations.
   - **Cluster Security Score**: High-level security posture overview with trending data.

## Developer API Endpoints

If you are developing against the console, the backend exposes the following new API endpoints specifically for the Kubescape integration. These require authentication headers if accessed externally:

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/security/kubescape/compliance` | Returns compliance assessment results across clusters. |
| `GET` | `/api/security/kubescape/findings` | Returns detailed security findings and violations. |
| `GET` | `/api/security/kubescape/frameworks` | Returns compliance framework scores. |
| `GET` | `/api/security/kubescape/status` | Returns a detection health-check summary indicating if Kubescape was found per cluster. |

## Security Community Integration

Kubescape is a CNCF Sandbox project maintained by ARMO, a leader in Kubernetes security. It provides comprehensive compliance and risk assessment for your clusters. By using the KubeStellar Console:

- **Unified Compliance Monitoring**: Track compliance across multiple frameworks from a single dashboard.
- **Fleet-wide Risk Assessment**: Identify and prioritize security risks across all your clusters.
- **Compliance Reporting**: Generate cross-cluster compliance reports for audits and stakeholders.
- **Proactive Remediation**: Monitor remediation progress for security findings across your platform.

For more information about Kubescape, visit the [Kubescape GitHub repository](https://github.com/kubescape/kubescape).

## Troubleshooting

- **Cards show "Demo Data" or "Integration Notice"**: The console did not find any Kubescape compliance reports in your clusters. Ensure Kubescape is installed and has completed its initial assessments.
- **Missing compliance data**: Ensure the console has read access to Kubescape custom resources in your clusters.
