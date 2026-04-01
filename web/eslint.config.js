import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'coverage', '.nyc_output', 'playwright-report', 'test-results'] },
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
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
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
      ],
    },
  },
)
