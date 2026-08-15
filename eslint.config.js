import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
    },
  },
  // Server-side code: the Vercel functions, the shared libraries they import,
  // and the security test harness. These run in Node, not in a browser, so
  // `process` and `Buffer` are globals here and `window` is not. Added by the
  // security branch — see HANDOFF-sec.md.
  {
    files: ['api/**/*.js', 'src/lib/**/*.js', 'scripts/**/*.{js,mjs}'],
    languageOptions: {
      globals: globals.node,
      sourceType: 'module',
    },
    rules: {
      // These files are never imported by a React component, so the Fast
      // Refresh constraint does not apply to them.
      'react-refresh/only-export-components': 'off',
    },
  },
])
