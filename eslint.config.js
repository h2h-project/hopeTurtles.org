import js from '@eslint/js';
import globals from 'globals';

// ESLint 9 flat config. Two environments live in this repo: ES-module Node for
// the server, and classic browser scripts under public/js.
export default [
  {
    ignores: [
      'node_modules/**',
      'ecojoiner/.venv/**',
      'public/ecojoiner_exports/**',
      'public/uploads/**',
      'public/_harness.html',
      'scripts/**'
    ]
  },

  js.configs.recommended,

  // Server-side: ES modules, Node globals.
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        ...globals.node
      }
    },
    rules: {
      'no-unused-vars': [
        'error',
        // Express error handlers must keep their 4th argument to be recognized,
        // and `catch {}` bindings are often deliberately ignored.
        { argsIgnorePattern: '^_|^next$', caughtErrors: 'none' }
      ]
    }
  },

  // Browser scripts are plain <script> files, not modules.
  {
    files: ['public/js/**/*.js'],
    languageOptions: {
      sourceType: 'script',
      globals: {
        ...globals.browser,
        // Loaded from CDN <script> tags in views/partials/footer.ejs.
        L: 'readonly', // Leaflet
        Chart: 'readonly', // Chart.js
        echarts: 'readonly'
      }
    }
  },

  // Awaiting inside a loop is deliberate in the telemetry batch ingest, where
  // rows must be inserted in order. The rule is on so those opt-outs stay
  // explicit rather than accidental.
  {
    files: ['controllers/**/*.js', 'models/**/*.js'],
    rules: {
      'no-await-in-loop': 'warn'
    }
  }
];
