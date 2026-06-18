# KubeStellar Console: Cloud Native Buildpacks Integration Guide

The KubeStellar Console integrates with Cloud Native Buildpacks to provide fleet-wide visibility and management of your cloud-native builds. This integration allows you to:

- Discover and monitor **Cloud Native Buildpack builds** across all your managed clusters.
- View **build status, builder health, and lifecycle metrics**.
- Track image layering, caching efficiency, and build performance.
- Monitor buildpack compliance and supply chain security.

## Prerequisites

- One or more Kubernetes clusters monitored by the KubeStellar Console.
- Cloud Native Buildpacks (kpack, pack, or equivalent) deployed on those clusters.
- KubeStellar Console installed and running.

## Setup

No explicit authentication setup is required for Cloud Native Buildpacks integration. The console uses your cluster's RBAC to discover buildpack resources.

### Required RBAC Permissions

The KubeStellar Console service account requires the following permissions to access Cloud Native Buildpacks resources:

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: kubestellar-console-buildpacks
rules:
- apiGroups: ["kpack.io"]
  resources: ["images", "builders", "buildpacks", "stores"]
  verbs: ["get", "list", "watch"]
- apiGroups: [""]
  resources: ["events"]
  verbs: ["get", "list", "watch"]
```

## How to View and Add Cards in the UI

The Cloud Native Buildpacks integrations are provided as dynamic cards that can be added to any of your dashboards in the Console.

1. Navigate to your main overview dashboard at `http://localhost:8080/` (or your specific hosted Console URL).
2. Click the **Add Card** (or **+**) button at the top right of the dashboard.
3. In the component catalog, scroll down to the **CI/CD** or **Buildpacks** category.
4. Select from the available views to add them to your board:
   - **Cloud Native Buildpack Builds**: View all builds, their status, and completion times.
   - **Builder Health**: Monitor buildpack builder availability and resource allocation.
   - **Build Performance**: Track build duration, cache efficiency, and layer information.
   - **Buildpack Status**: High-level overview of buildpack health and lifecycle.

## Developer API Endpoints

If you are developing against the console, the backend exposes the following new API endpoints specifically for the Cloud Native Buildpacks integration. These require authentication headers if accessed externally:

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/buildpacks/builds` | Returns all builds across clusters. |
| `GET` | `/api/buildpacks/builders` | Returns builder resources and their health status. |
| `GET` | `/api/buildpacks/images` | Returns image build configurations. |
| `GET` | `/api/buildpacks/status` | Returns a detection health-check summary indicating if buildpacks were found per cluster. |
| `GET` | `/api/buildpacks/metrics` | Returns build performance metrics and history. |

## Cloud-Native CI/CD Community Integration

Cloud Native Buildpacks is a CNCF Incubating project used by major cloud providers (Google Cloud Build, Heroku, VMware Tanzu) and enterprises for secure, reproducible container image builds. By using the KubeStellar Console:

- **Multi-cluster Build Visibility**: Monitor your entire CI/CD pipeline across clusters from a single dashboard.
- **Build Performance Optimization**: Identify bottlenecks and track caching efficiency across your fleet.
- **Supply Chain Security**: Ensure buildpack compliance and track image provenance across deployments.
- **Unified Reporting**: Generate cross-cluster build reports for audit and performance tracking.

For more information about Cloud Native Buildpacks, visit the [Cloud Native Buildpacks project website](https://buildpacks.io/).

## Troubleshooting

- **Cards show "Demo Data" or "Integration Notice"**: The console did not find any buildpack resources in your clusters. Ensure Cloud Native Buildpacks or kpack is installed and has created at least one image or builder resource.
- **Missing build metrics**: Ensure the console has read access to the buildpack custom resources in your clusters.
