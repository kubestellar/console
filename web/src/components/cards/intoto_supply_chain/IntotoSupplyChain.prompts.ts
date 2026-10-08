/** AI mission prompts used by the in-toto Supply Chain card. */

export const INTOTO_INSTALL_PROMPT = `I want to install in-toto for supply chain security on my Kubernetes clusters.

Please help me:
1. Install the in-toto admission controller via Helm
2. Create a sample layout policy covering build and deploy steps
3. Verify the CRDs are registered: layouts.in-toto.io and links.in-toto.io

Use the official in-toto Kubernetes integration:
  helm repo add in-toto https://in-toto.github.io/helm-charts
  helm install in-toto in-toto/in-toto --namespace in-toto --create-namespace

Important: Start in audit/dry-run mode to avoid blocking existing workloads.

Please proceed step by step.`

export const INTOTO_SAMPLE_LAYOUTS_PROMPT = `Deploy sample in-toto layouts so I can see the supply chain security dashboard in action.

Please create 3 sample in-toto Layout CRs covering a typical CI/CD pipeline:

1. **build-and-push** — Steps: clone-repo → run-tests → build-image → push-image
2. **deploy-pipeline** — Steps: pull-image → scan-image → apply-manifests
3. **release-signing** — Steps: sign-artifact → upload-provenance

Important:
- Add the annotation in-toto.io/mode: "audit" on all layouts
- Set functionary pubkeys to placeholder values (demo mode)
- After applying, verify with: kubectl get layouts.in-toto.io -A
- Check links: kubectl get links.in-toto.io -A

Please proceed step by step.`
