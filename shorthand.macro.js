const t = require('@babel/types');
const { expression } = require('@babel/template');
const isObject = require('iter-tools-es/methods/is-object');
const isUndefined = require('iter-tools-es/methods/is-undefined');
const isNull = require('iter-tools-es/methods/is-null');
const isString = require('iter-tools-es/methods/is-string');
const concat = require('iter-tools-es/methods/concat');
const { createMacro } = require('babel-plugin-macros');
const i = require('@bablr/language-bablr-vm-instruction');
const re = require('@bablr/language-regex-vm-pattern');
const spam = require('@bablr/language-spamex');
const str = require('@bablr/language-cstml-string');
// const num = require('@bablr/language-number');
const cstml = require('@bablr/language-cstml');
const { addNamespace, addNamed } = require('@babel/helper-module-imports');
const { PathResolver } = require('@bablr/agast-helpers/path');
const { sourceFromQuasis } = require('@bablr/agast-helpers/source');
const { buildSpamMatcher } = require('@bablr/agast-vm-helpers');
const { streamParseSync } = require('bablr');

const { hasOwn } = Object;
const { isArray } = Array;
const isNumber = (v) => typeof v === 'number';
const isBoolean = (v) => typeof v === 'boolean';

const isPlainObject = (v) => isObject(v) && !isArray(v);

const set = (obj, path, value) => {
  const { pathName, pathIsArray } = path;
  if (pathIsArray) {
    if (!obj[pathName]) {
      obj[pathName] = [];
    }

    if (!isArray(obj[pathName])) throw new Error('bad array value');

    obj[pathName].push(value);
  } else {
    if (hasOwn(obj, pathName)) {
      throw new Error('duplicate child name');
    }
    obj[pathName] = value;
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

const escapeReplacer = (esc) => {
  if (esc === '\r') {
    return '\\r';
  } else if (esc === '\n') {
    return '\\n';
  } else if (esc === '\0') {
    return '\\0';
  } else {
    return `\\${esc}`;
  }
};
const printTemplateString = (str) => {
  return `\`${str.replace(/[`\\\0\r\n]/g, escapeReplacer)}\``;
};

const generateNodeChild = (child, bindings) => {
  if (child.type === 'Reference') {
    const { pathName, pathIsArray } = child.value;
    const printedRef = pathIsArray ? `${pathName}[]` : pathName;
    return expression(`%%t%%.ref\`${printedRef}\``)({ t: bindings.t });
  } else if (child.type === 'Literal') {
    return expression(`%%t%%.lit${printTemplateString(child.value)}`)({ t: bindings.t });
  } else {
    throw new Error(`Unknown child type ${child.type}`);
  }
};

const generateNode = (node, exprs, bindings) => {
  const resolver = new PathResolver(node);
  const { children, type, language, attributes } = node;
  const properties_ = {};
  const children_ = [];

  if (!children) {
    throw new Error();
  }

  for (const child of children) {
    children_.push(generateNodeChild(child, bindings));

    if (child.type === 'Reference') {
      const path = child.value;
      const { pathIsArray } = path;
      const resolved = resolver.get(path);

      let embedded = resolved;
      if (resolved) {
        embedded = generateNode(resolved, exprs, bindings);
      } else {
        embedded = exprs.pop();
        const { interpolateArray, interpolateString } = bindings;

        if (pathIsArray) {
          embedded = expression('[...%%interpolateArray%%(%%embedded%%)]')({
            interpolateArray,
            embedded,
          }).elements[0];
        } else if (language === 'String' && type === 'String') {
          embedded = expression('%%interpolateString%%(%%embedded%%)')({
            interpolateString,
            embedded,
          });
        }
      }

      set(properties_, path, embedded);
    }
  }

  if (type === 'Punctuator' || type === 'Keyword') {
    return expression(`%%t%%.s_node(%%language%%, %%type%%, %%value%%)`)({
      t: bindings.t,
      language: t.stringLiteral(language),
      type: t.stringLiteral(type),
      value: t.stringLiteral(children[0].value),
    });
  } else {
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
  }
};

const languages = {
  i,
  re,
  spam,
  str,
  // num,
  cst: cstml,
};

const topTypes = {
  i: 'Call',
  re: 'Pattern',
  spam: 'Matcher',
  str: 'String',
  num: 'Integer',
  cst: 'Fragment',
};

const getTopScope = (scope) => {
  let top = scope;
  while (top.parent) top = top.parent;
  return top;
};

const shorthandMacro = ({ references }) => {
  const bindings = {};

  // decorator references

  for (const ref of concat(
    references.i,
    references.spam,
    references.re,
    references.str,
    references.num,
    references.cst,
  )) {
    if (!bindings.t) {
      bindings.t = addNamespace(getTopScope(ref.scope).path, '@bablr/helpers/shorthand', {
        nameHint: 't',
      });
    }

    const buildHelperBinding = (module_, name) => {
      if (!bindings[name]) {
        bindings[name] = addNamed(getTopScope(ref.scope).path, name, module_);
      }
    };

    buildHelperBinding('@bablr/helpers/template', 'interpolateArray');
    buildHelperBinding('@bablr/helpers/template', 'interpolateString');

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

    const ast = streamParseSync(
      language,
      sourceFromQuasis(quasis.map((q) => q.value.raw)),
      buildSpamMatcher(language, type),
    );

    taggedTemplate.replaceWith(generateNode(ast, expressions.reverse(), bindings));
  }
};

module.exports = createMacro(shorthandMacro);
