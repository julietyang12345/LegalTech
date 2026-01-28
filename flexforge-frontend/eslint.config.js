import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';

export default tseslint.config(
  // Ignore patterns
  {
    ignores: ['dist/**', 'node_modules/**', '*.config.js', '*.config.ts'],
  },

  // Base JS recommended rules
  js.configs.recommended,

  // TypeScript rules
  ...tseslint.configs.recommended,

  // React/TypeScript files
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: {
        ...globals.browser,
        ...globals.es2020,
      },
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      // React hooks rules
      ...reactHooks.configs.recommended.rules,

      // React refresh
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],

      // Unused variables - error with exceptions for intentional patterns
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',           // Allow _unused params
          varsIgnorePattern: '^_',           // Allow _unused vars
          caughtErrorsIgnorePattern: '^_',   // Allow _err in catch
          destructuredArrayIgnorePattern: '^_', // Allow [_, second]
          ignoreRestSiblings: true,          // Allow const { used, ...rest } = obj
        },
      ],

      // Other useful rules
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  }
);
