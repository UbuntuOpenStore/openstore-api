module.exports = {
  root: true,
  parserOptions: {
    sourceType: 'module'
  },
  extends: 'airbnb-base',
  'env': {
    'browser': false,
    'node': true
  },
  'rules': {
    // allow debugger during development
    'no-debugger': process.env.NODE_ENV === 'production' ? 2 : 0,
    'no-console': process.env.NODE_ENV === 'production' ? 1 : 0,

    'object-curly-spacing': 0,
    'object-shorthand': 0,
    'prefer-const': 0,
    'brace-style': [2, 'stroustrup'],
    'indent': [1 /* warning */, 4],
    'arrow-body-style': ['error', 'always'],
    'no-param-reassign': 0,
    'no-plusplus': 0,
    'eqeqeq': 0,
    'space-before-function-paren': 0,
    'func-names': 0,
    'newline-per-chained-call': 0,
    'prefer-destructuring': 0,
  }
}
