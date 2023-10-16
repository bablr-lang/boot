const t = require('@babel/types');
const { expression } = require('@babel/template');
const isObject = require('iter-tools-es/methods/is-object');
const isUndefined = require('iter-tools-es/methods/is-undefined');
const isNull = require('iter-tools-es/methods/is-null');
const isString = require('iter-tools-es/methods/is-string');
const { createMacro } = require('babel-plugin-macros');
const { TemplateParser } = require('./lib/miniparser.js');
const { Resolver } = require('./lib/resolver.js');
const i = require('./lib/languages/instruction.js');
const re = require('./lib/languages/regex.js');
const spam = require('./lib/languages/spamex.js');
const { set, parsePath } = require('./lib/utils.js');

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
    return expression.ast(`t.esc(${child.cooked}, ${child.raw})`);
  } else {
    throw new Error(`Unkown child type ${child.type}`);
  }
};

const generateNode = (node, exprs) => {
  const resolver = new Resolver();
  const { children, properties, type } = node;
  const type_ = t.stringLiteral(type);
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

  return expression.ast`t.node(${type_}, ${t.arrayExpression(children_)}, ${t.objectExpression(
    Object.entries(properties_).map(([key, value]) =>
      t.objectProperty(t.identifier(key), isArray(value) ? t.arrayExpression(value) : value),
    ),
  )})`;
};

const languages = {
  i,
  re,
  spam,
};

const shorthandMacro = ({ references }) => {
  for (const ref of Object.values(references).flat()) {
    const taggedTemplate =
      ref.parentPath.type === 'MemberExpression' ? ref.parentPath.parentPath : ref.parentPath;
    const { quasis, expressions } = taggedTemplate.node.quasi;

    const language = languages[ref.node.name];
    const type =
      ref.parentPath.type === 'MemberExpression' ? ref.parentPath.node.property.name : 'Call';

    if (!language) throw new Error();

    const ast = new TemplateParser(
      language,
      quasis.map((q) => q.value.raw),
      expressions.map(() => null),
    ).eval({ language: language.name, type });

    taggedTemplate.replaceWith(generateNode(ast, expressions));
  }
};

module.exports = createMacro(shorthandMacro);
