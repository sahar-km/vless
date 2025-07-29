import js from '@eslint/js';
import globals from 'globals';
import eslintPluginJsonc from 'eslint-plugin-jsonc';
import jsoncParser from 'jsonc-eslint-parser';
import eslintPluginYml from 'eslint-plugin-yml';
import ymlParser from 'yaml-eslint-parser';
import eslintPluginHtml from 'eslint-plugin-html';
import eslintConfigPrettier from 'eslint-config-prettier';

export default [
  {
    ignores: [
      '**/*.md',
      'dist/**',
      'build/**',
      '**/*.css',
      '**/*.scss',
      'warp.json',
      'hiddify/**',
      '.github/**',
      'edge/waste/**',
      'edge/unite.js',
      '**/clash-12.**',
      'sub/ProxyIP.md',
      'node_modules/**',
      'DNS over HTTPS/**',
      'package-lock.json',
      'edge/all-in-one.js',
      'edge/LoadBalance.js',
      'real address generator/**',
      'boringtun-boringtun-cli-0.5.2/**',
    ],
  },

  js.configs.recommended,
  {
    // ⚙️ JavaScript
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    rules: {
      'no-unused-vars': 'warn',
      'no-console': 'off',
      semi: ['error', 'always'],
      quotes: ['error', 'single'],
      'no-irregular-whitespace': [
        'error',
        {
          skipStrings: true,
          skipComments: false,
          skipRegExps: true,
          skipTemplates: true,
        },
      ],
    },

    // ⚙️ JSON, JSONC, JSON5
    files: ['**/*.json', '**/*.jsonc', '**/*.json5'],
    plugins: {
      jsonc: eslintPluginJsonc,
    },
    languageOptions: {
      parser: jsoncParser,
    },
    rules: {
      ...eslintPluginJsonc.configs['recommended-with-jsonc'].rules,
      'jsonc/sort-keys': 'error',
    },
  },

  {
    // ⚙️ YAML
    files: ['**/*.yaml', '**/*.yml'],
    plugins: {
      yml: eslintPluginYml,
    },
    languageOptions: {
      parser: ymlParser,
    },
    rules: {
      ...eslintPluginYml.configs.standard.rules,
      ...eslintPluginYml.configs.prettier.rules,
    },
  },

  {
    // ⚙️ HTML (For linting inside <script>)
    files: ['**/*.html'],
    plugins: {
      html: eslintPluginHtml,
    },
    languageOptions: {
      globals: { ...globals.browser },
    },
    rules: {},
  },
];
