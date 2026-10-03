// Shared ESLint flat config for the whole monorepo (apps + packages).
// Individual apps/packages can extend this by importing it in their own
// eslint.config.js if they need extra rules (e.g. React-specific lint rules
// added when web-submitter/web-admin are scaffolded).
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/node_modules/**',
      '**/coverage/**',
      // File service worker do CLI của MSW sinh ra (`npx msw init <public> --save`)
      // — code generated, không sửa tay nên không lint.
      '**/public/mockServiceWorker.js',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
  // React-specific rules: chỉ áp cho 2 app React trong `apps/*` (các package
  // trong `packages/*` không có React). `rules-of-hooks` là lỗi thật sự nên
  // để `error`; `exhaustive-deps` để `warn` vì có trường hợp cố ý bỏ dep.
  {
    files: ['apps/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  eslintConfigPrettier,
);
