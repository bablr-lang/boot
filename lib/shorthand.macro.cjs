const { createMacro } = require('babel-plugin-macros');

const { expression } = require('@babel/template');

function asyncMacro({ references, state, types: t }) {
  const { i = [], spam = [], re = [] } = references;

  for (const reference of i) {
    reference.replaceWith(t.objectLiteral());
  }

  for (const reference of spam) {
    reference.replaceWith(t.objectLiteral());
  }

  for (const reference of re) {
    reference.replaceWith(t.objectLiteral());
  }
}

module.exports = createMacro(asyncMacro);
