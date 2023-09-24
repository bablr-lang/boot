const base = require('@bablr/eslint-config-base');

module.exports = {
  ...base,
  globals: {
    ...base.globals,
    require: 'readonly',
    module: 'readonly',
    Proxy: 'readonly',
  },
};
