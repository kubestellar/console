# Visual Regression Baselines

## Generating Baselines

Baseline snapshots must be generated on **Linux** to match CI rendering.
The `.png` files must be committed to the repository.

### On Linux (native)

```bash
cd web
npm run build
npx playwright install --with-deps chromium
npm run test:visual:update
```

### On macOS (via Docker)

```bash
cd web
npm run build
docker run --rm -v $(pwd):/work -w /work mcr.microsoft.com/playwright:v1.52.0-jammy \
  npx playwright test --config e2e/visual/app-visual.config.ts --update-snapshots
```

## After Generating

Commit the generated `.png` files in:
- `web/e2e/visual/app-visual-regression.spec.ts-snapshots/chromium/`
- `web/e2e/visual/app-cicd-visual.spec.ts-snapshots/chromium/`

## CI Behavior

The CI workflow (`visual-regression.yml`) will **fail** if no baseline snapshots
exist. It does NOT auto-generate them. This ensures visual regressions are always
caught by comparing against intentionally committed baselines.
