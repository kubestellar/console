# KubeStellar Console Localization Contributor Guide

Welcome! This guide shows you how to contribute translations to the KubeStellar Console in your language. **No coding experience required** — translation contributions are one of the easiest ways to participate in open source.

## Why Translate?

- **Community benefit** — Make the console accessible to non-English speakers in your region
- **Low barrier to entry** — Edit JSON files directly on GitHub, no build tools needed
- **Fast review cycles** — Translation PRs are quick to review and merge
- **Career growth** — Many translators go on to contribute features and become core maintainers

## Current Languages

The console currently supports:
- 🇬🇧 **English** (en) — 100% complete
- 🇩🇪 **German** (de) — In progress
- 🇪🇸 **Spanish** (es) — In progress
- 🇫🇷 **French** (fr) — In progress
- 🇮🇳 **Hindi** (hi) — In progress
- 🇮🇹 **Italian** (it) — In progress
- 🇯🇵 **Japanese** (ja) — In progress
- 🇧🇷 **Portuguese (Brazil)** (pt) — In progress
- 🇨🇳 **Simplified Chinese** (zh) — In progress

**Is your language missing?** Create an issue to request it, or follow the [Adding a New Language](#adding-a-new-language) guide below.

## Quick Start: Adding Translations

### Option 1: Edit on GitHub (No Setup Required)

1. **Open a locale file** — Go to [`web/src/locales/`](../web/src/locales/) and select your language folder
2. **Pick a file to translate** — Start with `common.json` (most frequently used strings)
3. **Click the edit icon (pencil)** in the top right
4. **Translate one or more strings** — Leave the key unchanged, translate the value
5. **Create a commit message** — Example: `🌍 translate: add Japanese strings to common.json`
6. **Open a pull request** — We'll review and merge it within 24–48 hours

**Example translation:**
```json
{
  "navigation.dashboard": "ダッシュボード",
  "actions.save": "保存",
  "alerts.success": "成功しました"
}
```

### Option 2: Local Setup (Full Translation)

If you want to translate multiple files or run the app locally in your language:

```bash
# 1. Clone the repository
git clone https://github.com/kubestellar/console.git
cd console

# 2. Install dependencies
cd web && npm install

# 3. Start the dev server
npm run dev

# 4. Open the app and switch language (settings menu)
# Your changes will auto-refresh

# 5. Create a branch and commit your translations
git checkout -b translate/add-{language}-strings
git add web/src/locales/{language}/
git commit -s -m "🌍 translate: add {language} strings to {filename}.json"
git push origin translate/add-{language}-strings
```

Then open a PR on GitHub.

## Translation File Structure

Each locale folder contains 4 JSON files:

| File | Purpose | Example Strings |
|------|---------|-----------------|
| `common.json` | UI labels, navigation, actions | "Dashboard", "Save", "Close", "Cluster" |
| `cards.json` | Card titles and descriptions | "Pod Health", "Node Status", "Resource Usage" |
| `status.json` | Status values and states | "Running", "Pending", "Failed", "Healthy" |
| `errors.json` | Error messages | "Connection failed", "Invalid input", "Not found" |

## Adding a New Language

### Step 1: Create Locale Files

1. Create a new folder in `web/src/locales/{language-code}/` (e.g., `ko` for Korean, `pt-BR` for Brazilian Portuguese)
2. Copy all 4 JSON files from `web/src/locales/en/`:
   - `common.json`
   - `cards.json`
   - `status.json`
   - `errors.json`
3. Translate the values (keep keys unchanged)

### Step 2: Register the Language

Edit `web/src/lib/i18n.ts`:

```typescript
// Add import (around line 1–45)
import commonKO from '../locales/ko/common.json'
import cardsKO from '../locales/ko/cards.json'
import statusKO from '../locales/ko/status.json'
import errorsKO from '../locales/ko/errors.json'

// Add to resources object (around line 45–100)
export const resources = {
  // ... existing languages ...
  ko: {
    common: commonKO,
    cards: cardsKO,
    status: statusKO,
    errors: errorsKO,
  },
}

// Add to language list (around line 100–120, in i18n.init)
supportedLngs: ['en', 'de', 'es', 'fr', 'hi', 'it', 'ja', 'pt', 'zh', 'ko'],
```

### Step 3: Test Locally

```bash
cd web
npm install
npm run dev

# Open the app, switch language in settings, verify all strings display correctly
```

### Step 4: Submit Your PR

```bash
git add web/src/locales/ko/ web/src/lib/i18n.ts
git commit -s -m "✨ feat: add Korean localization"
git push origin translate/add-korean
```

## Translation Guidelines

### String Keys and Context

Never translate the **keys** — only translate the **values**. Keys are used by the app to look up strings.

```json
{
  "navigation.dashboard": "ダッシュボード",
  "navigation.settings": "設定"
}
```

NOT:
```json
{
  "ナビゲーション.ダッシュボード": "Dashboard"
}
```

### Consistency

- Keep terminology consistent within a file — if "Pod" is translated as "ポッド" the first time, use "ポッド" everywhere
- Reference other locale files to see how similar concepts are translated
- For technical terms (Kubernetes concepts like "Pod", "Node", "Cluster"), check CNCF guidelines for your language

### Tone and Style

- Match the tone of the English strings — professional but friendly
- Keep translations concise — UIs have limited space
- Avoid gendered pronouns when possible (e.g., use "user" instead of "he/she")

### Abbreviations and Units

- For dates/times, follow your locale's conventions
- For numbers (e.g., percentages, memory), use your locale's decimal separator
- Keep metric abbreviations (CPU, RAM, GB) consistent with CNCF standards

## Common Mistakes to Avoid

| ❌ Mistake | ✅ Correct |
|-----------|-----------|
| Translating JSON keys | Keep keys in English, only translate values |
| Inconsistent terminology | Use the same term every time (not "ダッシュボード" and "ダッシュ") |
| Over-translating | Some terms (Kubernetes concepts) are better left in English with community consensus |
| Not testing locally | Always run `npm run dev` and switch languages to verify |
| Changing JSON structure | Keep the same keys and nesting — only edit the string values |

## Review Process

1. **You submit a PR** with new or updated translations
2. **Maintainers review for**:
   - Correct JSON syntax (we run a linter)
   - Translation quality and consistency
   - No keys are changed
   - Files are properly formatted
3. **Usually approved within 24–48 hours**
4. **Merged into main** — your translation goes live in the next release

## Questions?

- **Issue tracker** — Post in [GitHub Issues](https://github.com/kubestellar/console/issues)
- **Slack** — Join [CNCF Slack](https://cloud-native.slack.com) and mention `@kubestellar`
- **Community** — Check if other translators are working on your language

## Translation Coverage Tracking

We use labels to organize translation work:

- `i18n: needed` — String needs translation
- `i18n: {language}` — Work specific to that language
- `good-first-issue` — Easy issues for new contributors

Search issues to see what strings your language still needs.

## Credits

Translations are contributed by community members like you. Every translator is credited in:
- [CONTRIBUTORS.md](../CONTRIBUTORS.md)
- Release notes
- Console footer (in progress)

Thank you for making KubeStellar Console accessible to the world! 🌍

---

**Last updated**: June 2026  
**Maintained by**: KubeStellar Community  
**License**: Apache 2.0
