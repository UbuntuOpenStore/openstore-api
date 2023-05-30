module.exports = {
  env: {
    node: true,
    es2021: true,
    mocha: true,
  },
  extends: [
    'eslint-config-bhdouglass',
    'plugin:chai-friendly/recommended',
  ],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    project: ['tsconfig.json'],
    tsconfigRootDir: __dirname,
  },
  rules: {
    'no-debugger': process.env.NODE_ENV === 'production' ? 2 : 0,
    'no-console': process.env.NODE_ENV === 'production' ? 1 : 0,

    '@typescript-eslint/no-misused-promises': 'off',
    '@typescript-eslint/consistent-indexed-object-style': 'off',
    '@typescript-eslint/ban-ts-comment': 'off',
    '@typescript-eslint/prefer-ts-expect-error': 'off',
    '@typescript-eslint/array-type': 'off',

    '@typescript-eslint/prefer-optional-chain': 'off', // TODO fix these errors
    '@typescript-eslint/prefer-nullish-coalescing': 'off', // TODO fix these errors
  },
  overrides: [
    {
      files: '*.spec.ts',
      rules: {
        '@typescript-eslint/no-unused-expressions': 'off',
        '@typescript-eslint/restrict-template-expressions': 'off',
      },
    },
  ],
};
