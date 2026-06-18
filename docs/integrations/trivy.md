# KubeStellar Console: Trivy Integration Guide

The KubeStellar Console integrates with Trivy to provide fleet-wide vulnerability scanning and security posture visibility. This integration allows you to:

- Discover and view **Trivy vulnerability scans** across all your managed clusters.
- Monitor **image and configuration scanning** results from Trivy operators (Trivy Operator, Starboard).
- View vulnerability severity distribution and compliance status.
- Track security findings across all container registries and workloads.

## Prerequisites

- One or more Kubernetes clusters monitored by the KubeStellar Console.
- Trivy or Trivy Operator deployed on those clusters (typically in the `trivy-system` namespace).
- KubeStellar Console installed and running.

## Setup

No explicit authentication setup is required for Trivy integration. The console uses your cluster's RBAC to discover Trivy scan reports.

### Required RBAC Permissions

The KubeStellar Console service account requires the following permissions to access Trivy resources:

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: kubestellar-console-trivy
rules:
- apiGroups: ["aquasecurity.github.io"]
  resources: ["vulnerabilityreports", "imagescans", "configauditreports"]
  verbs: ["get", "list", "watch"]
- apiGroups: [""]
  resources: ["events"]
  verbs: ["get", "list", "watch"]
```

## How to View and Add Cards in the UI

The Trivy integrations are provided as dynamic cards that can be added to any of your dashboards in the Console.

1. Navigate to your main overview dashboard at `http://localhost:8080/` (or your specific hosted Console URL).
2. Click the **Add Card** (or **+**) button at the top right of the dashboard.
3. In the component catalog, scroll down to the **Security** category.
4. Select from the available views to add them to your board:
   - **Trivy Vulnerability Scans**: View vulnerability reports by severity across containers and images.
   - **Trivy Image Scanning**: Monitor container image scan results and registry compliance.
   - **Trivy Configuration Audits**: View configuration security findings across your workloads.
   - **Vulnerability Trends**: Track vulnerability discoveries and remediation over time.

## Developer API Endpoints

If you are developing against the console, the backend exposes the following new API endpoints specifically for the Trivy integration. These require authentication headers if accessed externally:

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/security/trivy/scans` | Returns all vulnerability scan reports across clusters. |
| `GET` | `/api/security/trivy/images` | Returns image scanning results. |
| `GET` | `/api/security/trivy/summaries` | Returns aggregated vulnerability severity summaries. |
| `GET` | `/api/security/trivy/status` | Returns a detection health-check summary indicating if Trivy was found per cluster. |

## Security Community Integration

Trivy is the most-starred CNCF security tool with an active community of users and contributors. It is maintained by Aqua Security, a leader in cloud-native security. By using the KubeStellar Console:

- **Multi-cluster Compliance**: Monitor security posture across all your clusters from a single dashboard.
- **Unified Reporting**: Generate cross-cluster vulnerability reports for compliance and audit purposes.
- **Proactive Threat Detection**: Quickly identify critical vulnerabilities across your entire fleet.

For more information about Trivy, visit the [Trivy GitHub repository](https://github.com/aquasecurity/trivy).

## Troubleshooting

- **Cards show "Demo Data" or "Integration Notice"**: The console did not find any Trivy scan reports in your clusters. Ensure Trivy or Trivy Operator is installed and has completed its initial scans.
- **Missing scan data**: Ensure the console has read access to the custom resources created by Trivy in your clusters.
