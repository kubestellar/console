# KubeStellar Console + Cloud Native Buildpacks Integration

**Cloud Native Buildpacks** is a CNCF Incubating project that transforms your application source code into container images without requiring Dockerfiles. The KubeStellar Console ships a Buildpacks status card that monitors build health, builder status, and lifecycle metrics across your clusters.

## About Cloud Native Buildpacks

[Cloud Native Buildpacks (CNB)](https://buildpacks.io) provide a higher-level abstraction for building OCI images, used by major platforms including Heroku, VMware Tanzu, and Google Cloud Build. As a CNCF Incubating project, CNB enables secure, standardized, and reproducible builds.

**Key Features:**
- Automatic dependency detection and installation
- Bill-of-materials (SBOM) generation for security compliance
- Efficient layer caching and rebasing
- Multi-language support (Java, Node.js, Go, Python, Ruby, .NET, etc.)
- Production-ready without Dockerfile expertise

## Buildpacks Status Card in KubeStellar Console

The `buildpacks-status` card provides:
- **Build Status**: Real-time status of CNB builds across clusters
- **Builder Health**: Availability and version of installed builders
- **Lifecycle Metrics**: Build duration, cache hit rates, layer reuse
- **SBOM Tracking**: Software bill-of-materials generation status

This integration gives platform teams **multi-cluster visibility** into their CI/CD build health—a capability that CNB's native tooling doesn't provide.

## Get Started

1. **Install Pack CLI**: Follow the [pack installation guide](https://buildpacks.io/docs/tools/pack/)
2. **Deploy Builders**: Install CNB builders in your Kubernetes clusters (kpack, Tekton, or other operators)
3. **Connect to Console**: The KubeStellar Console auto-discovers buildpack builds and builder resources

## Common Use Cases

### Platform Engineering Teams
Monitor build health across dev, staging, and production clusters from a single dashboard.

### Security & Compliance
Track SBOM generation and ensure all builds meet security standards.

### CI/CD Optimization
Identify slow builds, cache misses, and opportunities for layer reuse.

## Resources

- [Cloud Native Buildpacks GitHub](https://github.com/buildpacks/pack) (~2k stars)
- [CNB Documentation](https://buildpacks.io/docs/)
- [CNCF Project Page](https://www.cncf.io/projects/buildpacks/)
- [Community Slack](https://slack.buildpacks.io/)
- [RFC Repository](https://github.com/buildpacks/rfcs)

## Co-Promotion Opportunities

We're eager to engage with the Cloud Native Buildpacks community! Interested in:
- Co-authored blog posts on "Observing CNB at scale"
- Joint demos at KubeCon or other CNCF events
- Listing KubeStellar in the CNB ecosystem page

Reach out in the [KubeStellar Slack](https://cloud-native.slack.com/archives/C097094RZ3M) or open an issue on the [buildpacks/pack repository](https://github.com/buildpacks/pack/issues).

## Example: Monitoring CNB Builds

When using kpack or Tekton with CNB, the console automatically surfaces:

```yaml
# Example build status visible in the console
apiVersion: kpack.io/v1alpha2
kind: Build
metadata:
  name: sample-app-build
status:
  conditions:
  - type: Succeeded
    status: "True"
  latestImage: registry.example.com/sample-app@sha256:abc123...
  buildMetadata:
  - key: "io.buildpacks.build.metadata"
    value: |
      {
        "bom": [...],
        "buildpacks": [...],
        "launcher": {...}
      }
```

The console parses this data and presents aggregated metrics for all builds across your fleet.

---

*This integration demonstrates KubeStellar's commitment to the cloud-native ecosystem and support for CNCF incubating projects.*

<style type="text/css">
.centerImage {
    display: block;
    margin: auto;
}
</style>
