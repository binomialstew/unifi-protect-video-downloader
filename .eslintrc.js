module.exports = {
  extends: ['eslint:recommended', 'eslint-config-airbnb-base', 'plugin:node/recommended'],
  env: {
    browser: true,
    commonjs: true,
    es2021: true,
  },
  globals: {
    process: true,
  },
  overrides: [
    {
      env: {
        node: true,
      },
      files: ['.eslintrc.{js,cjs}'],
      parserOptions: {
        sourceType: 'script',
      },
    },
  ],
  parserOptions: {
    ecmaVersion: 'latest',
  },
};
