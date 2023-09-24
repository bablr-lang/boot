const { createMacro } = require('babel-plugin-macros');

const { expression } = require('@babel/template');

function asyncMacro({ references, state, babel: { types: t } }) {
  const { i = [], spam = [], re = [] } = references;

  for (const reference of i) {
    reference.parentPath.replaceWith(t.objectExpression([]));
  }

  for (const reference of spam) {
    reference.parentPath.replaceWith(t.objectExpression([]));
  }

  for (const reference of re) {
    reference.parentPath.replaceWith(t.objectExpression([]));
  }
}

module.exports = createMacro(asyncMacro);
