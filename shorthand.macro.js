const t = require('@babel/types');
const { expression } = require('@babel/template');
const isObject = require('iter-tools-es/methods/is-object');
const isUndefined = require('iter-tools-es/methods/is-undefined');
const isNull = require('iter-tools-es/methods/is-null');
const isString = require('iter-tools-es/methods/is-string');
const concat = require('iter-tools-es/methods/concat');
const { createMacro } = require('babel-plugin-macros');
const { TemplateParser } = require('./lib/miniparser.js');
const i = require('./lib/languages/instruction.js');
const re = require('./lib/languages/regex.js');
const spam = require('./lib/languages/spamex.js');
const { parsePath } = require('./lib/utils.js');
const { addNamespace, addNamed } = require('@babel/helper-module-imports');
const { PathResolver } = require('@bablr/boot-helpers/path');

const { hasOwn } = Object;
const { isArray } = Array;
const isPlainObject = (v) => isObject(v) && !isArray(v);

const setFlat = (obj, path, value) => {
  const { pathName } = parsePath(path);

  if (hasOwn(obj, pathName)) {
    throw new Error('duplicate child name');
  }
  obj[pathName] = value;
};

const getASTValue = (v, exprs, bindings) => {
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
    : generateNode(v, exprs, bindings);
};

const generateNodeChild = (child, bindings) => {
  if (child.type === 'Reference') {
    return expression(`%%t%%.ref\`${child.value}\``)({ t: bindings.t });
  } else if (child.type === 'Gap') {
    return expression(`%%t%%.gap\`${child.value}\``)({ t: bindings.t });
  } else if (child.type === 'String') {
    return expression(`%%t%%.str\`${child.value.replace(/\\/g, '\\\\')}\``)({ t: bindings.t });
  } else if (child.type === 'Trivia') {
    return expression(`%%t%%.trivia\` \``)({ t: bindings.t });
  } else if (child.type === 'Escape') {
    return expression(`%%t%%.esc(%%cooked%%, %%raw%%)`)({
      t: bindings.t,
      cooked: child.cooked,
      raw: child.raw,
    });
  } else {
    throw new Error(`Unknown child type ${child.type}`);
  }
};

const generateNode = (node, exprs, bindings) => {
  const resolver = new PathResolver(node);
  const { children, type, language } = node;
  const properties_ = {};
  const children_ = [];

  for (const child of children) {
    children_.push(generateNodeChild(child, bindings));

    if (child.type === 'Reference' || child.type === 'Gap') {
      const path = child.value;

      if (child.type === 'Gap') {
        const { pathIsArray } = parsePath(path);
        if (pathIsArray) {
          const expr = expression('%%interpolateArray%%(%%expr%%)')({
            interpolateArray: bindings.interpolateArray,
            expr: exprs.pop(),
          });

          setFlat(properties_, path, expr);
        } else {
          setFlat(properties_, path, exprs.pop());
        }
      } else {
        let value = resolver.get(path);
        setFlat(properties_, path, generateNode(value, exprs, bindings));
      }
    }
  }

  return expression(`%%t%%.node(%%language%%, %%type%%, %%children%%, %%properties%%)`)({
    t: bindings.t,
    language: t.stringLiteral(language),
    type: t.stringLiteral(type),
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

const topTypes = {
  i: 'Call',
  re: 'Pattern',
  spam: 'Matcher',
};

const getTopScope = (scope) => {
  let top = scope;
  while (top.parent) top = top.parent;
  return top;
};

const shorthandMacro = ({ references }) => {
  const bindings = {};

  // decorator references

  for (const ref of concat(references.i, references.spam, references.re)) {
    if (!bindings.t) {
      bindings.t = addNamespace(getTopScope(ref.scope).path, '@bablr/boot-helpers/types', {
        nameHint: 't',
      });
    }

    if (!bindings.interpolateArray) {
      bindings.interpolateArray = addNamed(
        getTopScope(ref.scope).path,
        'interpolateArray',
        '@bablr/boot-helpers/template',
      );
    }

    const taggedTemplate =
      ref.parentPath.type === 'MemberExpression' ? ref.parentPath.parentPath : ref.parentPath;

    const { quasis, expressions } = taggedTemplate.node.quasi;

    const tagName = ref.node.name;
    const language = languages[tagName];
    const type =
      ref.parentPath.type === 'MemberExpression'
        ? ref.parentPath.node.property.name
        : topTypes[tagName];

    if (!language) throw new Error();

    const ast = new TemplateParser(
      language,
      quasis.map((q) => q.value.raw),
      expressions.map(() => null),
    ).eval({ language: language.name, type });

    taggedTemplate.replaceWith(generateNode(ast, expressions, bindings));
  }
};

module.exports = createMacro(shorthandMacro);
