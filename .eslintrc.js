module.exports = {
  root: true,
  parserOptions: {
    ecmaVersion: 10,
    sourceType: 'module'
  },
  extends: [
    'eslint-config-bhdouglass',
  ],
  'env': {
    'browser': false,
    'node': true,
    'mocha': true
  },
  'rules': {
    // allow debugger during development
    'no-debugger': process.env.NODE_ENV === 'production' ? 2 : 0,
    'no-console': process.env.NODE_ENV === 'production' ? 1 : 0,

    'no-underscore-dangle': 'off',
  },
  overrides: [
    {
      files: "*-test.js",
      rules: {
        'no-unused-expressions': 'off'
      }
    }
  ]
}
