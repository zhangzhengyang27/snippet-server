import tseslint from 'typescript-eslint';
import eslint from '@eslint/js';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'admin/**'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
    },
  },
)
