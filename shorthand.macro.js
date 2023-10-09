const t = require('@babel/types');
const { expression } = require('@babel/template');
const isObject = require('iter-tools-es/methods/is-object');
const isUndefined = require('iter-tools-es/methods/is-undefined');
const isNull = require('iter-tools-es/methods/is-null');
const isString = require('iter-tools-es/methods/is-string');
const { createMacro } = require('babel-plugin-macros');
const { TemplateParser } = require('./lib/miniparser.js');
const { Resolver } = require('./lib/resolver.js');
const instruction = require('./lib/languages/instruction.js');

const { isArray } = Array;

const getASTValue = (v, exprs) => {
  if (isObject(v) && v.type?.type === 'GapNodeTag') {
    return exprs.pop();
  } else {
    return isNull(v)
      ? t.nullLiteral()
      : isUndefined(v)
      ? t.identifier('undefined')
      : isString(v)
      ? t.stringLiteral(v)
      : isArray(v)
      ? t.arrayExpression(v.map((v) => getASTValue(v, exprs)))
      : generateEmbedded(v, exprs);
  }
};

const generateEmbedded = (node, exprs) => {
  const resolver = new Resolver();
  return expression.ast`t.node()`;
};

const gap = { type: { language: instruction.name, production: 'Call' }, attrs: {} };

const shorthandMacro = ({ references }) => {
  const { i = [], spam = [], re = [] } = references;

  for (const ref of i) {
    const taggedTemplate = ref.parentPath;
    const { quasis, expressions } = taggedTemplate.node.quasi;

    const ast = new TemplateParser(
      instruction,
      quasis.map((q) => q.value.raw),
      expressions.map(() => null),
    ).eval(gap);
    // console.log(JSON.stringify(ast, undefined, 4));
    taggedTemplate.replaceWith(generateEmbedded(ast, expressions));
  }

  for (const reference of spam) {
    reference.parentPath.replaceWith(t.objectExpression([]));
  }

  for (const reference of re) {
    reference.parentPath.replaceWith(t.objectExpression([]));
  }
};

module.exports = createMacro(shorthandMacro);
