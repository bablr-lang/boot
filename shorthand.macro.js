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
const { set, parsePath, stripPathBraces } = require('./lib/utils.js');

const { isArray } = Array;

const isPlainObject = (v) => isObject(v) && !isArray(v);

const getASTValue = (v, exprs) => {
  return isNull(v)
    ? t.nullLiteral()
    : isUndefined(v)
    ? t.identifier('undefined')
    : isString(v)
    ? t.stringLiteral(v)
    : isArray(v)
    ? t.arrayExpression(v.map((v) => getASTValue(v, exprs)))
    : isPlainObject(v) && !v.language
    ? t.objectExpression(
        Object.entries(v).map(([k, v]) => t.objectProperty(t.identifier(k), getASTValue(v))),
      )
    : generateNode(v, exprs);
};

const generateNodeChild = (child) => {
  if (child.type === 'Reference') {
    return expression.ast(`t.ref\`${child.value}\``);
  } else if (child.type === 'Gap') {
    return expression.ast(`t.gap\`${child.value}\``);
  } else if (child.type === 'String') {
    return expression.ast(`t.str\`${child.value.replace(/\\/g, '\\\\')}\``);
  } else if (child.type === 'Trivia') {
    return expression.ast(`t.trivia\` \``);
  } else if (child.type === 'Escape') {
    return expression.ast(`t.esc\`${child.value.replace(/\n/g, '\\n'.replace(/\\/g, '\\\\'))}\``);
  } else {
    throw new Error(`Unkown child type ${child.type}`);
  }
};

const generateNode = (node, exprs) => {
  const resolver = new Resolver();
  const { children, properties, language, production } = node;
  const production_ = t.stringLiteral(production);
  const properties_ = {};
  const children_ = [];

  for (const child of children) {
    children_.push(generateNodeChild(child));

    if (child.type === 'Reference' || child.type === 'Gap') {
      const path = child.value;
      const { pathIsArray, pathName } = parsePath(path);

      if (child.type === 'Gap') {
        set(properties_, path, exprs.pop());
      } else {
        let value = properties[pathName];
        if (pathIsArray) {
          value = value[resolver.eat(pathName)];
        }
        set(properties_, path, generateNode(value, exprs));
      }
    }
  }

  return expression.ast`t.node(${production_}, ${t.arrayExpression(
    children_,
  )}, ${t.objectExpression(
    Object.entries(properties_).map(([key, value]) =>
      t.objectProperty(t.identifier(key), isArray(value) ? t.arrayExpression(value) : value),
    ),
  )})`;
};

const id = { language: instruction.name, type: 'Call' };

const shorthandMacro = ({ references }) => {
  const { i = [], spam = [], re = [] } = references;

  for (const ref of i) {
    const taggedTemplate = ref.parentPath;
    const { quasis, expressions } = taggedTemplate.node.quasi;

    const ast = new TemplateParser(
      instruction,
      quasis.map((q) => q.value.raw),
      expressions.map(() => null),
    ).eval(id);

    taggedTemplate.replaceWith(generateNode(ast, expressions));
  }

  for (const reference of spam) {
    reference.parentPath.replaceWith(t.objectExpression([]));
  }

  for (const reference of re) {
    reference.parentPath.replaceWith(t.objectExpression([]));
  }
};

module.exports = createMacro(shorthandMacro);
