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
const isNumber = (v) => typeof v === 'number';
const isBoolean = (v) => typeof v === 'boolean';

const isPlainObject = (v) => isObject(v) && !isArray(v);

const set = (obj, path, value, pathIsArray) => {
  if (pathIsArray) {
    if (!obj[path]) {
      obj[path] = [];
    }

    if (!isArray(obj[path])) throw new Error('bad array value');

    obj[path].push(value);
  } else {
    if (hasOwn(obj, path)) {
      throw new Error('duplicate child name');
    }
    obj[path] = value;
  }
};

const getASTValue = (v, exprs, bindings) => {
  return isNull(v)
    ? t.nullLiteral()
    : isUndefined(v)
    ? t.identifier('undefined')
    : isString(v)
    ? t.stringLiteral(v)
    : isNumber(v)
    ? t.numericLiteral(v)
    : isBoolean(v)
    ? t.booleanLiteral(v)
    : isArray(v)
    ? t.arrayExpression(v.map((v) => getASTValue(v, exprs, bindings)))
    : isPlainObject(v) && !v.language
    ? t.objectExpression(
        Object.entries(v).map(([k, v]) =>
          t.objectProperty(t.identifier(k), getASTValue(v, exprs, bindings)),
        ),
      )
    : generateNode(v, exprs, bindings);
};

const generateNodeChild = (child, bindings) => {
  if (child.type === 'Reference') {
    return expression(`%%t%%.ref\`${child.value}\``)({ t: bindings.t });
  } else if (child.type === 'Literal') {
    return expression(`%%t%%.lit\`${child.value.replace(/\\/g, '\\\\')}\``)({ t: bindings.t });
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
  const { children, type, language, attributes, properties } = node;
  const properties_ = {};
  const children_ = [];

  if (!children) {
    throw new Error();
  }

  for (const child of children) {
    children_.push(generateNodeChild(child, bindings));

    if (child.type === 'Reference') {
      const path = child.value;
      const resolved = resolver.get(path);
      const pathIsArray = isArray(properties[path]);

      let embedded = resolved;
      if (resolved) {
        embedded = generateNode(resolved, exprs, bindings);
      } else {
        embedded = exprs.pop();
        const { interpolateArray, interpolateString } = bindings;

        if (pathIsArray) {
          embedded = expression('%%interpolateArray%%(%%embedded%%)')({
            interpolateArray,
            embedded,
          });
        } else if (child.id.type === 'Literal') {
          embedded = expression('%%interpolateString%%(%%embedded%%, %%language%%)')({
            interpolateString,
            embedded,
            language: t.stringLiteral(language),
          });
        }
      }

      set(properties_, path, embedded, pathIsArray);
    }
  }

  return expression(
    `%%t%%.node(%%language%%, %%type%%, %%children%%, %%properties%%, %%attributes%%)`,
  )({
    t: bindings.t,
    language: t.stringLiteral(language),
    type: t.stringLiteral(type),
    children: t.arrayExpression(children_),
    properties: t.objectExpression(
      Object.entries(properties_).map(([key, value]) =>
        t.objectProperty(t.identifier(key), isArray(value) ? t.arrayExpression(value) : value),
      ),
    ),
    attributes: t.objectExpression(
      Object.entries(attributes).map(([key, value]) =>
        t.objectProperty(t.identifier(key), getASTValue(value, exprs, bindings)),
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

    if (!bindings.interpolateString) {
      bindings.interpolateString = addNamed(
        getTopScope(ref.scope).path,
        'interpolateString',
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
