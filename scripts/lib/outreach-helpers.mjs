/**
 * Pure helper functions for CNCF outreach issue generation.
 * No side-effects — safe to import in tests without filesystem access.
 *
 * Related: Issue #3003
 */

/**
 * Convert a project name to a URL-safe slug.
 * Lowercases, replaces non-alphanumeric runs with hyphens, trims edge hyphens.
 * @param {string} name
 * @returns {string}
 */
export function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Convert a hyphenated slug or name to title-case.
 * Each hyphen-separated token is capitalised.
 * @param {string} name
 * @returns {string}
 */
export function titleCase(name) {
  return name
    .split('-')
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(' ');
}

/**
 * Generate the GitHub issue title for an outreach mission.
 * @param {string} project - raw project name / slug
 * @returns {string}
 */
export function generateIssueTitle(project) {
  return `[install-mission] Add ${titleCase(slugify(project))} to KubeStellar console catalog`;
}

/**
 * Generate the GitHub issue body for an outreach mission.
 * @param {string} project - raw project name / slug
 * @param {string} [consoleUrl] - optional override for the console URL
 * @returns {string}
 */
export function generateIssueBody(project, consoleUrl) {
  const slug = slugify(project);
  const base = consoleUrl || process.env.CONSOLE_URL || 'https://console.kubestellar.io';
  const improveUrl = `${base}/improve?project=${encodeURIComponent(slug)}`;

  return [
    `## Add ${titleCase(slug)} to KubeStellar Console`,
    '',
    `**Project**: \`${slug}\``,
    '',
    'This issue tracks the creation of an install mission for the project above so it appears in the KubeStellar console catalog.',
    '',
    '### Acceptance criteria',
    '',
    `- [ ] Mission JSON exists at \`fixes/cncf-install/${slug}.json\``,
    '- [ ] Mission validates against the \`kc-mission-v1\` schema',
    '- [ ] Mission includes at least 4 steps with real kubectl / YAML content',
    '',
    `[Improve this listing](${improveUrl})`,
  ].join('\n');
}

/**
 * Return the standard label set for an outreach mission issue.
 * Always returns a fresh array — callers must not mutate it across calls.
 * @returns {string[]}
 */
export function generateIssueLabels() {
  return ['cncf-outreach', 'install-mission', 'help wanted', 'good first issue'];
}
