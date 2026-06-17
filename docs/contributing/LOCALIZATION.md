# Localization Contributor Guide

Thank you for helping make the KubeStellar Console accessible to users around the world! This guide explains how to contribute translations to the project.

## Overview

The KubeStellar Console uses [i18next](https://www.i18next.com/) with [react-i18next](https://react.i18next.com/) for internationalization (i18n). Translations are organized into **namespaces** (JSON files), one per language.

### Currently Supported Languages

| Code | Language | Status |
|------|----------|--------|
| `en` | English | ✅ Complete (source of truth) |
| `zh` | 中文 (简体) — Simplified Chinese | 🔶 Partial |
| `de` | Deutsch — German | 🔶 Partial |
| `es` | Español — Spanish | 🔶 Partial |
| `fr` | Français — French | 🔶 Partial |
| `hi` | हिन्दी — Hindi | 🔶 Partial |
| `it` | Italiano — Italian | 🔶 Partial |
| `ja` | 日本語 — Japanese | 🔶 Partial |
| `ko` | 한국어 — Korean | 🔶 Partial |
| `pt` | Português — Portuguese (Brazil) | 🔶 Partial |
| `zh-TW` | 中文 (繁體) — Traditional Chinese | 🔶 Partial |

> **Legend:** ✅ Complete · 🔶 Partial (stub — needs contributors like you!) · ❌ Not started

---

## Translation File Structure

All locale files live in:

```
web/src/locales/
├── en/          ← English (source of truth — do NOT edit)
│   ├── common.json
│   ├── cards.json
│   ├── errors.json
│   └── status.json
├── zh/
│   ├── common.json
│   ├── cards.json
│   ├── errors.json
│   └── status.json
└── ko/          ← Each language follows the same layout
    ├── common.json
    ├── cards.json
    ├── errors.json
    └── status.json
```

### Namespaces

| File | Purpose |
|------|---------|
| `common.json` | Navigation, actions, buttons, labels, sidebar, settings, and shared UI strings |
| `cards.json` | Dashboard card titles, descriptions, and card-specific labels |
| `errors.json` | Error messages, validation messages, and recovery prompts |
| `status.json` | Kubernetes resource status labels (pod states, cluster health, severity) |

---

## How to Contribute Translations

### 1. Find Untranslated Keys

The English locale (`web/src/locales/en/`) is the source of truth. Any key in a non-English file whose value still matches the English string is a candidate for translation.

Example — in `ko/common.json`, a key that still shows English needs a Korean translation:

```json
// Before (stub — needs translation)
"buttons": {
  "addCard": "Add Card"
}

// After (translated)
"buttons": {
  "addCard": "카드 추가"
}
```

### 2. Edit the Right File

Navigate to `web/src/locales/<lang>/` and open the appropriate JSON file.

- General UI text → `common.json`
- Card names/descriptions → `cards.json`
- Error messages → `errors.json`
- Status labels → `status.json`

### 3. Follow JSON Structure

- **Do not add or remove keys.** Every key must match the English file exactly.
- **Translate the values, never the keys.**
- **Keep interpolation placeholders** (`{{count}}`, `{{name}}`, `{{time}}`) — these are replaced at runtime.
- **Preserve plural suffixes** (`_one`, `_other`) — i18next uses these for pluralization.

```json
// Correct — key unchanged, value translated
"minutesAgo_one": "{{count}}분 전",
"minutesAgo_other": "{{count}}분 전"

// Wrong — do not change the key
"분전_one": "{{count}}분 전"
```

### 4. Add a New Language

If your language is not listed yet, open a GitHub issue first to coordinate. Then:

1. **Create the locale directory:**
   ```bash
   mkdir -p web/src/locales/<lang>
   ```

2. **Copy the Japanese stub files as a starting point** (they have the complete key structure):
   ```bash
   cp web/src/locales/ja/common.json web/src/locales/<lang>/common.json
   cp web/src/locales/ja/cards.json  web/src/locales/<lang>/cards.json
   cp web/src/locales/ja/errors.json web/src/locales/<lang>/errors.json
   cp web/src/locales/ja/status.json web/src/locales/<lang>/status.json
   ```

3. **Register the language in `web/src/lib/i18n.ts`:**

   Add imports at the top:
   ```typescript
   import commonXX from '../locales/xx/common.json'
   import cardsXX  from '../locales/xx/cards.json'
   import statusXX from '../locales/xx/status.json'
   import errorsXX from '../locales/xx/errors.json'
   ```

   Add to the `resources` object:
   ```typescript
   xx: {
     common: commonXX,
     cards:  cardsXX,
     status: statusXX,
     errors: errorsXX,
   },
   ```

   Add to the `languages` array:
   ```typescript
   { code: 'xx', name: 'Your Language', flag: '🏳️' },
   ```

   Add to `supportedLngs`:
   ```typescript
   supportedLngs: [..., 'xx'],
   ```

4. **Update the i18n test** (`web/src/lib/__tests__/i18n.test.ts`):
   ```typescript
   it('supports Your Language locale', () => {
     expect(resources.xx).toBeDefined()
     expect(resources.xx.common).toBeDefined()
   })
   ```

5. **Start translating** — begin with `errors.json` and `status.json` (smallest files), then tackle `common.json` and `cards.json`.

---

## Testing Your Translations Locally

### 1. Start the development server

```bash
./start-dev.sh
```

The frontend runs on **http://localhost:5174**.

### 2. Switch language in the UI

Open the console in your browser, go to **Settings → Language**, and select your language.

### 3. Run the unit tests

```bash
cd web
npm test -- src/lib/__tests__/i18n.test.ts
```

All i18n tests should pass. The test suite verifies:
- Every language in the `languages` array has a corresponding resource entry.
- Every resource has all four namespaces (`common`, `cards`, `status`, `errors`).
- Key content is translated (not left as English placeholders).

### 4. Run the full i18n compliance test (optional)

```bash
cd web
npx playwright test e2e/compliance/i18n-compliance.spec.ts
```

This end-to-end test verifies locale files, language switching, and HTML `lang` attribute correctness.

---

## Style Guide

| Rule | Detail |
|------|--------|
| **Respect technical terms** | Keep Kubernetes terms (`Pod`, `Deployment`, `Namespace`) in English — they are not translated in technical docs. |
| **Keep it concise** | UI labels are often short — prefer crisp translations over long paraphrases. |
| **Preserve tone** | The UI uses a friendly, professional tone. Match this in your language. |
| **Interpolation is not optional** | Never remove `{{...}}` placeholders — they inject dynamic values at runtime. |
| **Plural forms** | Always provide both `_one` and `_other` suffixes for keys that contain `{{count}}`. |

---

## Submitting Your Contribution

1. **Fork** the repository and create a feature branch:
   ```bash
   git checkout -b i18n/add-ko-translations
   ```

2. Make your translation changes.

3. **Open a Pull Request** with a descriptive title, e.g.:
   > `i18n: add Korean translations for common.json`

4. Reference any related issue in the PR description:
   > `Closes #XXXX`

5. A maintainer will review your PR. Expect feedback on accuracy, style, and completeness.

---

## Getting Help

- **GitHub Discussions:** Start a discussion in the [kubestellar/console](https://github.com/kubestellar/console/discussions) repo.
- **GitHub Issues:** File a bug or request under the `i18n` label.
- **i18next docs:** https://www.i18next.com/
- **react-i18next docs:** https://react.i18next.com/

We appreciate every translation, no matter how small. Even translating a single file helps make KubeStellar more accessible to your community. Thank you! 🌍
