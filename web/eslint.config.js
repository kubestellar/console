import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'coverage', '.nyc_output', 'playwright-report', 'test-results', 'storybook-static'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
        destructuredArrayIgnorePattern: '^_',
      }],
      // Warn on patterns that often indicate unbatched state updates (#3049)
      // Encourages useReducer or single-object setState for related state
      'no-restricted-globals': ['error',
        { name: 'alert', message: 'Use ConfirmDialog or Toast instead of browser alert().' },
        { name: 'confirm', message: 'Use ConfirmDialog instead of browser confirm().' },
        { name: 'prompt', message: 'Use a styled input modal instead of browser prompt().' },
      ],
      'no-restricted-syntax': ['warn',
        {
          selector: 'CallExpression[callee.name=/^set[A-Z]/] + CallExpression[callee.name=/^set[A-Z]/]',
          message: 'Consecutive setState calls may cause UI flicker. Consider batching with useReducer or a single state object.',
        },
        {
          selector: 'JSXOpeningElement[name.name="input"]:not([name.name="Input"])',
          message: 'Use <Input> from components/ui/Input.tsx instead of raw <input>.',
        },
        {
          selector: 'JSXOpeningElement[name.name="textarea"]',
          message: 'Use <TextArea> from components/ui/TextArea.tsx instead of raw <textarea>.',
        },
        {
          selector: 'JSXOpeningElement[name.name="select"]',
          message: 'Use <Select> from components/ui/Select.tsx instead of raw <select>.',
        },
      ],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: [
      'src/**/*.test.{ts,tsx}',
      'src/**/*.spec.{ts,tsx}',
      'src/**/*.stories.{ts,tsx}',
      'src/e2e/**',
    ],
    rules: {
      'max-lines': ['warn', {
        max: 800,
        skipBlankLines: true,
        skipComments: true,
      }],
    },
  },
  // The shared form components themselves necessarily render native elements —
  // disable the raw-element guards for those files only.
  {
    files: [
      'src/components/ui/Input.tsx',
      'src/components/ui/TextArea.tsx',
      'src/components/ui/Select.tsx',
    ],
    rules: {
      'no-restricted-syntax': ['warn',
        {
          selector: 'CallExpression[callee.name=/^set[A-Z]/] + CallExpression[callee.name=/^set[A-Z]/]',
          message: 'Consecutive setState calls may cause UI flicker. Consider batching with useReducer or a single state object.',
        },
      ],
    },
  },
  // Test and spec files — relax strict TypeScript rules that are impractical
  // in test code (mocking often requires `any`, require() imports, etc.).
  {
    files: [
      '**/__tests__/**/*.{ts,tsx}',
      '**/*.test.{ts,tsx}',
      '**/*.spec.{ts,tsx}',
      'e2e/**/*.{ts,tsx}',
      'netlify/**/__tests__/**/*.{ts,tsx}',
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-non-null-asserted-optional-chain': 'warn',
      '@typescript-eslint/no-this-alias': 'warn',
      '@typescript-eslint/no-require-imports': 'warn',
      '@typescript-eslint/no-unused-expressions': 'warn',
      'no-empty-pattern': 'warn',
      'react-hooks/rules-of-hooks': 'warn',
    },
  },
)
