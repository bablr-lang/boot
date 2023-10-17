const t = require('@babel/types');
const { expression } = require('@babel/template');
const isObject = require('iter-tools-es/methods/is-object');
const isUndefined = require('iter-tools-es/methods/is-undefined');
const isNull = require('iter-tools-es/methods/is-null');
const isString = require('iter-tools-es/methods/is-string');
const concat = require('iter-tools-es/methods/concat');
const { createMacro } = require('babel-plugin-macros');
const { TemplateParser } = require('./lib/miniparser.js');
const { Resolver } = require('./lib/resolver.js');
const i = require('./lib/languages/instruction.js');
const re = require('./lib/languages/regex.js');
const spam = require('./lib/languages/spamex.js');
const { set, parsePath } = require('./lib/utils.js');
const { addNamespace } = require('@babel/helper-module-imports');

const { isArray } = Array;

const isPlainObject = (v) => isObject(v) && !isArray(v);

const getASTValue = (v, exprs, t_) => {
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
    : generateNode(v, exprs, t_);
};

const generateNodeChild = (child, t_) => {
  if (child.type === 'Reference') {
    return expression(`%%t_%%.ref\`${child.value}\``)({ t_ });
  } else if (child.type === 'Gap') {
    return expression(`%%t_%%.gap\`${child.value}\``)({ t_ });
  } else if (child.type === 'String') {
    return expression(`%%t_%%.str\`${child.value.replace(/\\/g, '\\\\')}\``)({ t_ });
  } else if (child.type === 'Trivia') {
    return expression(`%%t_%%.trivia\` \``)({ t_ });
  } else if (child.type === 'Escape') {
    return expression(`%%t_%%.esc(%%cooked%%, %%raw%%)`)({
      t_,
      cooked: child.cooked,
      raw: child.raw,
    });
  } else {
    throw new Error(`Unknown child type ${child.type}`);
  }
};

const generateNode = (node, exprs, t_) => {
  const resolver = new Resolver();
  const { children, properties, type } = node;
  const type_ = t.stringLiteral(type);
  const properties_ = {};
  const children_ = [];

  for (const child of children) {
    children_.push(generateNodeChild(child, t_));

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
        set(properties_, path, generateNode(value, exprs, t_));
      }
    }
  }

  return expression(`%%t%%.node(%%type%%, %%children%%, %%properties%%)`)({
    t: t_,
    type: type_,
    children: t.arrayExpression(children_),
    properties: t.objectExpression(
      Object.entries(properties_).map(([key, value]) =>
        t.objectProperty(t.identifier(key), isArray(value) ? t.arrayExpression(value) : value),
      ),
    ),
  });
};

const languages = {
  i,
  re,
  spam,
};

const getTopScope = (scope) => {
  let top = scope;
  while (top.parent) top = top.parent;
  return top;
};

const shorthandMacro = ({ references }) => {
  let importName = null;

  // decorator references

  for (const ref of concat(references.i, references.spam, references.re)) {
    if (!importName) {
      importName = addNamespace(getTopScope(ref.scope).path, '@bablr/boot-helpers/types', {
        nameHint: 't',
      });
    }

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

    taggedTemplate.replaceWith(generateNode(ast, expressions, importName));
  }
};

module.exports = createMacro(shorthandMacro);
