# KubeStellar Console: Knative Integration Guide

The KubeStellar Console integrates with Knative to provide fleet-wide visibility and management of your serverless applications. This integration allows you to:

- Discover and monitor **Knative Services** across all your managed clusters.
- View real-time serving status, domain routing, and traffic management.
- Monitor **Knative Eventing** sources and channels for event-driven architectures.
- Track revision health, cold-start metrics, and autoscaling behavior across clusters.

## Prerequisites

- One or more Kubernetes clusters monitored by the KubeStellar Console.
- Knative Serving and/or Eventing deployed on those clusters (typically in the `knative-serving` and `knative-eventing` namespaces).
- KubeStellar Console installed and running.

## Setup

No explicit authentication setup is required for Knative integration. The console uses your cluster's RBAC to discover Knative custom resources.

### Required RBAC Permissions

The KubeStellar Console service account requires the following permissions to access Knative resources:

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: kubestellar-console-knative
rules:
- apiGroups: ["serving.knative.dev"]
  resources: ["services", "revisions", "configurations"]
  verbs: ["get", "list", "watch"]
- apiGroups: ["eventing.knative.dev"]
  resources: ["sources", "channels", "brokers"]
  verbs: ["get", "list", "watch"]
```

## How to View and Add Cards in the UI

The Knative integrations are provided as dynamic cards that can be added to any of your dashboards in the Console.

1. Navigate to your main overview dashboard at `http://localhost:8080/` (or your specific hosted Console URL).
2. Click the **Add Card** (or **+**) button at the top right of the dashboard.
3. In the component catalog, scroll down to the **Knative** category.
4. Select from the available views to add them to your board:
   - **Knative Services**: View all serverless services, domain routing, and traffic management status.
   - **Knative Revisions**: Monitor individual revision health and autoscaling metrics.
   - **Knative Eventing**: View event sources, channels, and broker status across clusters.
   - **Knative Status**: High-level health overview of Knative components.

## Developer API Endpoints

If you are developing against the console, the backend exposes the following new API endpoints specifically for the Knative integration. These require authentication headers if accessed externally:

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/knative/services` | Returns all discovered Knative Services across clusters. |
| `GET` | `/api/knative/revisions` | Returns all discovered Knative Revisions across clusters. |
| `GET` | `/api/knative/eventing/sources` | Returns all discovered event sources. |
| `GET` | `/api/knative/status` | Returns a detection health-check summary indicating if Knative was found per cluster. |
| `GET` | `/api/knative/metrics` | Returns aggregated cold-start and scaling metrics. |

## Serverless Community Integration

Knative is a CNCF Graduated project with an active community of practitioners building serverless workloads on Kubernetes. By using the KubeStellar Console:

- **Multi-cluster Visibility**: Monitor serverless deployments across multiple clusters from a single pane.
- **Unified Observability**: Correlate Knative events with cluster-wide metrics and logs.
- **Fleet Management**: Manage Knative configurations and traffic policies across your platform.

For more information about Knative, visit the [Knative project website](https://knative.dev/).

## Troubleshooting

- **Cards show "Demo Data" or "Integration Notice"**: The console did not find any Knative Services or Eventing resources in your clusters. Ensure Knative is installed in the clusters the console is bound to.
- **Missing metrics**: Ensure the console has read access to the `knative-serving` and `knative-eventing` namespaces and their custom resources.
