module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: './tsconfig.json',
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
    'eslint-config-prettier',
  ],
  env: {
    node: true,
    jest: true,
  },
  ignorePatterns: ['.eslintrc.cjs', 'dist', 'node_modules'],
  rules: {
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/ban-ts-comment': 'error',
    '@typescript-eslint/no-floating-promises': 'error',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/no-unsafe-member-access': 'off',
    '@typescript-eslint/no-unsafe-assignment': 'off',
    '@typescript-eslint/no-unsafe-call': 'off',
    '@typescript-eslint/no-unsafe-return': 'off',
  },
};
