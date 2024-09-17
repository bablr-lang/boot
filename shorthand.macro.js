const { spawnSync } = require('node:child_process');
const t = require('@babel/types');
const { expression } = require('@babel/template');
const { diff } = require('jest-diff');
const isObject = require('iter-tools/methods/is-object');
const isUndefined = require('iter-tools/methods/is-undefined');
const isNull = require('iter-tools/methods/is-null');
const isString = require('iter-tools/methods/is-string');
const concat = require('iter-tools/methods/concat');
const { createMacro } = require('babel-plugin-macros');
const { TemplateParser, add, getAgASTValue } = require('./lib/index.js');
const i = require('./lib/languages/instruction.js');
const re = require('./lib/languages/regex.js');
const spam = require('./lib/languages/spamex.js');
const cstml = require('./lib/languages/cstml.js');
const { addNamespace, addNamed } = require('@babel/helper-module-imports');
const { printPrettyCSTML } = require('./lib/print.js');
const sym = require('@bablr/boot-helpers/symbols');
const {
  OpenNodeTag,
  CloseNodeTag,
  ReferenceTag,
  GapTag,
  ArrayTag,
  LiteralTag,
  EmbeddedNode,
} = require('@bablr/boot-helpers/symbols');

const { isArray } = Array;
const { hasOwn } = Object;
const isNumber = (v) => typeof v === 'number';
const isBoolean = (v) => typeof v === 'boolean';
const isPlainObject = (v) => isObject(v) && !isArray(v);
const printRef = (ref) => (ref.isArray ? `${ref.name}[]` : ref.name);

const getBabelASTValue = (v, exprs, bindings) => {
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
    ? t.arrayExpression(v.map((v) => getBabelASTValue(v, exprs, bindings)))
    : isPlainObject(v) && !v.language
    ? t.objectExpression(
        Object.entries(v).map(([k, v]) =>
          t.objectProperty(t.identifier(k), getBabelASTValue(v, exprs, bindings)),
        ),
      )
    : generateBabelNode(v, exprs, bindings);
};

const generateBabelNodeChild = (child, exprs, bindings) => {
  if (child.type === ReferenceTag) {
    return expression(`%%t%%.ref\`${printRef(child.value)}\``)({ t: bindings.t });
  } else if (child.type === LiteralTag) {
    return expression(`%%t%%.lit(%%value%%)`)({
      t: bindings.t,
      value: getBabelASTValue(child.value, exprs, bindings),
    });
  } else if (child.type === EmbeddedNode) {
    return expression(`%%t%%.embedded(%%value%%)`)({
      t: bindings.t,
      value: generateBabelNode(child.value, exprs, bindings),
    });
  } else if (child.type === ArrayTag) {
    return expression(`%%t%%.arr()`)({
      t: bindings.t,
    });
  } else if (child.type === GapTag) {
    return expression(`%%t%%.gap()`)({
      t: bindings.t,
    });
  } else {
    throw new Error(`Unknown child type ${child.type}`);
  }
};

const getAgastNodeType = (flags) => {
  if (flags.intrinsic && flags.token) {
    return 's_i_node';
  } else if (flags.token && flags.trivia) {
    return 's_t_node';
  } else if (flags.token && flags.escape) {
    return 's_e_node';
  } else if (flags.escape) {
    return 'e_node';
  } else if (flags.token) {
    return 's_node';
  } else {
    return 'node';
  }
};

const generateBabelNode = (node, exprs, bindings) => {
  const { flags = {}, children, type, language, attributes } = node;

  const properties_ = {};
  const children_ = [];

  if (!children) {
    throw new Error();
  }

  // resolver.advance({ type: DoctypeTag, value: {} });

  for (const child of children) {
    if (child.type === ReferenceTag) {
      const path = child.value;
      const { isArray: pathIsArray, name } = path;
      if (!pathIsArray || hasOwn(properties_, name)) {
        let resolved = node.properties[name];

        if (pathIsArray) {
          resolved = resolved[properties_[name].length];
        }

        if (resolved.type !== sym.gap) {
          add(properties_, path, generateBabelNode(resolved, exprs, bindings));
          children_.push(generateBabelNodeChild(child, exprs, bindings));
        } else {
          // gap
          const expr = exprs.pop();
          const { interpolateArray, interpolateArrayChildren, interpolateString } = bindings;

          if (pathIsArray) {
            add(
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
                    "%%t%%.embedded(%%t%%.t_node(%%l%%.Comment, null, [%%t%%.embedded(%%t%%.t_node('Space', 'Space', [%%t%%.lit(' ')]))]))",
                  )({ t: bindings.t, l: bindings.l }),
                }),
              ),
            );
          } else if (language === cstml.canonicalURL && type === 'String') {
            add(
              properties_,
              path,
              expression('%%interpolateString%%(%%expr%%)')({
                interpolateString,
                expr,
              }),
            );

            children_.push(generateBabelNodeChild(child, exprs, bindings));
          } else {
            add(properties_, path, expr);

            children_.push(generateBabelNodeChild(child, exprs, bindings));
          }
        }
      } else if (pathIsArray) {
        children_.push(generateBabelNodeChild(child, exprs, bindings));
        properties_[name] = [];
      }
    } else {
      if (child.type !== OpenNodeTag && child.type !== CloseNodeTag) {
        children_.push(generateBabelNodeChild(child, exprs, bindings));
      }
    }
  }

  const nodeType = getAgastNodeType(flags);

  const propsAtts =
    nodeType === 's_node' || nodeType === 's_i_node' ? '' : ', %%properties%%, %%attributes%%';
  const propsAttsValue =
    nodeType === 's_node' || nodeType === 's_i_node'
      ? {}
      : {
          properties: t.objectExpression(
            Object.entries(properties_).map(([key, value]) =>
              t.objectProperty(
                t.identifier(key),
                isArray(value) ? t.arrayExpression(value) : value,
              ),
            ),
          ),
          attributes: t.objectExpression(
            Object.entries(attributes).map(([key, value]) =>
              t.objectProperty(t.identifier(key), getBabelASTValue(value, exprs, bindings)),
            ),
          ),
        };

  if (type === sym.gap) {
    return expression(`%%t%%.g_node()`)({ t: bindings.t });
  }

  return expression(`%%t%%.%%nodeType%%(%%l%%.%%language%%, %%type%%, %%children%%${propsAtts})`)({
    t: bindings.t,
    l: bindings.l,
    language: t.identifier(namesFor[language]),
    nodeType: t.identifier(nodeType),
    type: t.stringLiteral(type),
    children:
      nodeType === 's_node' || nodeType === 's_i_node'
        ? t.stringLiteral(children[1].value)
        : t.arrayExpression(children_),
    ...propsAttsValue,
  });
};

const getTopScope = (scope) => {
  let top = scope;
  while (top.parent) top = top.parent;
  return top;
};

const namesFor = Object.fromEntries([
  ...[i, re, spam, cstml].map((l) => [l.canonicalURL, l.name]),
  ['https://bablr.org/languages/core/en/space-tab-newline', 'Space'],
]);

const languages = {
  i: '@bablr/language-en-bablr-vm-instruction',
  re: '@bablr/language-en-regex-vm-pattern',
  spam: '@bablr/language-en-spamex',
  str: '@bablr/language-en-cstml',
  num: '@bablr/language-en-cstml',
  cst: '@bablr/language-en-cstml',
};

const topTypes = {
  i: 'Call',
  re: 'Pattern',
  spam: 'Matcher',
  str: 'String',
  num: 'Integer',
  cst: 'Node',
};

const miniLanguages = {
  i,
  re,
  spam,
  str: cstml,
  num: cstml,
  cst: cstml,
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

    if (!bindings.l) {
      bindings.l = addNamespace(getTopScope(ref.scope).path, '@bablr/agast-vm-helpers/languages', {
        nameHint: 'l',
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

    const streamText = quasis
      .map((q) => `"${q.value.raw.replace(/[\\"]/g, '\\$&')}"`)
      .join(' <//> ');

    // console.log(streamText);

    const miniLanguage = miniLanguages[tagName];

    const ast = new TemplateParser(
      miniLanguage,
      quasis.map((q) => q.value.raw),
      expressions.map(() => null),
    ).eval({ language: miniLanguage.name, type });

    const agAST = getAgASTValue(miniLanguage, ast);
    let referenceDocument = null;

    const document = printPrettyCSTML(agAST);

    // try {
    //   const documentResult = spawnSync(
    //     '../bablr-cli/bin/index.js',
    //     ['-l', language, '-p', type, '-f'],
    //     {
    //       input: streamText,
    //       encoding: 'utf8',
    //     },
    //   );

    //   if (documentResult.status > 0) {
    //     throw new Error('bablr CLI parse return non-zero exit');
    //   }

    //   if (documentResult.error) {
    //     throw new Error(documentResult.error);
    //   }

    //   referenceDocument = documentResult.stdout.slice(0, -1);

    //   if (!referenceDocument.length) {
    //     throw new Error();
    //   }

    //   // secondaryAst = parse(cstml, 'Document', document);
    // } catch (e) {
    //   console.warn('  parse failure');
    // }

    taggedTemplate.replaceWith(generateBabelNode(agAST, expressions.reverse(), bindings));
  }
};

module.exports = createMacro(shorthandMacro);
