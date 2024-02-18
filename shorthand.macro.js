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
const str = require('./lib/languages/string.js');
const num = require('./lib/languages/number.js');
const cstml = require('./lib/languages/cstml.js');
const { addNamespace, addNamed } = require('@babel/helper-module-imports');
const { PathResolver } = require('@bablr/boot-helpers/path');
const { buildLiteral, buildAttributes, buildSpace } = require('./lib/builders');

const { hasOwn } = Object;
const { isArray } = Array;
const isNumber = (v) => typeof v === 'number';
const isBoolean = (v) => typeof v === 'boolean';

const isPlainObject = (v) => isObject(v) && !isArray(v);

const printRef = (ref) => (ref.pathIsArray ? `${ref.pathName}[]` : ref.pathName);

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

const generateNodeChild = (child, exprs, bindings) => {
  if (child.type === 'Reference') {
    return expression(`%%t%%.ref\`${printRef(child.value)}\``)({ t: bindings.t });
  } else if (child.type === 'Literal') {
    return expression(`%%t%%.lit(%%value%%)`)({
      t: bindings.t,
      value: getASTValue(child.value, exprs, bindings),
    });
  } else if (child.type === 'Trivia') {
    return expression(`%%t%%.embedded(%%node%%)`)({
      t: bindings.t,
      node: expression(
        `%%t%%.t_node('Space', 'Space', %%children%%, %%properties%%, %%attributes%%)`,
      )({
        t: bindings.t,
        children: getASTValue([buildLiteral(child.value)], exprs, bindings),
        properties: getASTValue({}, exprs, bindings),
        attributes: getASTValue(buildAttributes({}), exprs, bindings),
      }),
    });
  } else if (child.type === 'Escape') {
    const { cooked, raw } = child.value;
    const children = getASTValue([buildLiteral(raw)], exprs, bindings);

    return expression(`%%t%%.embedded(%%node%%)`)({
      t: bindings.t,
      node: expression(
        `%%t%%.s_e_node('Escape', 'SymbolicEscape', %%children%%, %%properties%%, %%attributes%%)`,
      )({
        t: bindings.t,
        children,
        properties: getASTValue({}, exprs, bindings),
        attributes: t.objectExpression(
          Object.entries({ cooked }).map(([key, value]) =>
            t.objectProperty(t.identifier(key), getASTValue(value, exprs, bindings)),
          ),
        ),
      }),
    });
  } else {
    throw new Error(`Unknown child type ${child.type}`);
  }
};

const generateNode = (node, exprs, bindings) => {
  const resolver = new PathResolver(node);
  const { children, type, language, attributes } = node;

  if (
    (children.length === 1 && children[0].type === 'Literal' && type === 'Punctuator') ||
    type === 'Keyword'
  ) {
    return expression(`%%t%%.s_node(%%language%%, %%type%%, %%value%%)`)({
      t: bindings.t,
      language: t.stringLiteral(language),
      type: t.stringLiteral(type),
      value: t.stringLiteral(children[0].value),
    });
  } else {
    const properties_ = {};
    const children_ = [];

    if (!children) {
      throw new Error();
    }

    for (const child of children) {
      if (child.type === 'Reference') {
        const path = child.value;
        const { pathIsArray, pathName } = path;
        const resolved = resolver.get(path);

        if (resolved) {
          set(properties_, path, generateNode(resolved, exprs, bindings));
          children_.push(generateNodeChild(child, exprs, bindings));
        } else {
          // gap
          const expr = exprs.pop();
          const { interpolateArray, interpolateArrayChildren, interpolateString } = bindings;

          if (pathIsArray) {
            set(
              properties_,
              path,
              expression('[...%%interpolateArray%%(%%expr%%)]')({
                interpolateArray,
                expr,
              }).elements[0],
            );

            children_.push(
              t.spreadElement(
                expression('%%interpolateArrayChildren%%(%%expr%%, %%ref%%, %%sep%%)')({
                  interpolateArrayChildren,
                  expr,
                  ref: expression(`%%t%%.ref\`${printRef(child.value)}\``)({ t: bindings.t }),

                  // Really really awful unsafe-as-heck hack, to be removed ASAP
                  // Fixing this requires having interpolation happen during parsing
                  // That way the grammar can deal with the separators!
                  sep: expression(
                    "t.t_node('Comment', null, [t.t_node('Space', 'Space', [t.lit(' ')])])",
                  )(),
                }),
              ),
            );
          } else if (language === 'String' && type === 'String') {
            set(
              properties_,
              path,
              expression('%%interpolateString%%(%%expr%%)')({
                interpolateString,
                expr,
              }),
            );

            children_.push(generateNodeChild(child, exprs, bindings));
          } else {
            set(properties_, path, expr);

            children_.push(generateNodeChild(child, exprs, bindings));
          }
        }
      } else {
        children_.push(generateNodeChild(child, exprs, bindings));
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
  }
};

const languages = {
  i,
  re,
  spam,
  str,
  num,
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
      bindings.t = addNamespace(getTopScope(ref.scope).path, '@bablr/agast-helpers/shorthand', {
        nameHint: 't',
      });
    }

    if (!bindings.interpolateArray) {
      bindings.interpolateArray = addNamed(
        getTopScope(ref.scope).path,
        'interpolateArray',
        '@bablr/agast-helpers/template',
      );
    }

    if (!bindings.interpolateArrayChildren) {
      bindings.interpolateArrayChildren = addNamed(
        getTopScope(ref.scope).path,
        'interpolateArrayChildren',
        '@bablr/agast-helpers/template',
      );
    }

    if (!bindings.interpolateString) {
      bindings.interpolateString = addNamed(
        getTopScope(ref.scope).path,
        'interpolateString',
        '@bablr/agast-helpers/template',
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

    taggedTemplate.replaceWith(generateNode(ast, expressions.reverse(), bindings));
  }
};

module.exports = createMacro(shorthandMacro);
