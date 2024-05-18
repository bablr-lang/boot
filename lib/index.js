const { PathResolver } = require('@bablr/boot-helpers/path');
const cstml = require('./languages/cstml.js');
const regex = require('./languages/regex.js');
const { buildLiteral } = require('./builders.js');
const { TemplateParser } = require('./miniparser.js');

const { isArray } = Array;
const { hasOwn } = Object;

const set = (obj, path, value) => {
  const { name, isArray: pathIsArray } = path;
  if (pathIsArray) {
    if (!obj[name]) {
      obj[name] = [];
    }

    if (!isArray(obj[name])) throw new Error('bad array value');

    obj[name].push(value);
  } else {
    if (hasOwn(obj, name)) {
      throw new Error('duplicate child name');
    }
    obj[name] = value;
  }
};

const buildTag = (language, defaultType) => {
  const defaultTag = (quasis, ...exprs) => {
    return getAgASTValue(
      language,
      new TemplateParser(language, quasis.raw, exprs).eval({
        language: language.name,
        type: defaultType,
      }),
    );
  };

  return new Proxy(defaultTag, {
    apply(defaultTag, receiver, argsList) {
      return defaultTag.apply(receiver, argsList);
    },

    get(_, type) {
      return (quasis, ...exprs) => {
        return getAgASTValue(
          language,
          new TemplateParser(language, quasis.raw, exprs).eval({
            language: language.name,
            type,
          }),
        );
      };
    },
  });
};

const parse = (language, type, sourceText) => {
  return new TemplateParser(language, [sourceText], []).eval({
    language: language.name,
    type,
  });
};

const getAgASTValue = (language, miniNode) => {
  if (!miniNode) return miniNode;

  const { language: languageName, type, attributes } = miniNode;
  const flags = { escape: false, trivia: false, token: false, intrinsic: false };
  const properties = {};
  const children = [];
  const resolver = new PathResolver(miniNode);
  const resolvedLanguage =
    languageName !== language.name ? language.dependencies[languageName] : language;

  if (
    type === 'Punctuator' ||
    type === 'Keyword' ||
    type === 'Identifier' ||
    type === 'StringContent'
  ) {
    flags.token = true;
  }

  if (type === 'Punctuator' || type === 'Keyword') {
    flags.intrinsic = true;
  }

  for (const child of miniNode.children) {
    if (child.type === 'Reference') {
      const path = child.value;
      const node = resolver.get(path);
      set(properties, path, getAgASTValue(resolvedLanguage, node));
      children.push(child);
    } else if (child.type === 'Trivia') {
      children.push({
        type: 'Embedded',
        value: {
          flags: { escape: false, token: true, trivia: true, intrinsic: false },
          language: 'https://github.com/bablr-lang/language-blank-space',
          type: 'Space',
          children: [buildLiteral(child.value)],
          properties: {},
          attributes: {},
        },
      });
    } else if (child.type === 'Escape') {
      const { cooked, raw } = child.value;
      const attributes = { cooked };

      children.push({
        type: 'Embedded',
        value: {
          flags: { escape: true, token: true, trivia: false, intrinsic: false },
          language: cstml.canonicalURL,
          type: 'Escape',
          children: [buildLiteral(raw)],
          properties: {},
          attributes,
        },
      });
    } else {
      children.push(child);
    }
  }

  return { flags, language: resolvedLanguage.canonicalURL, type, children, properties, attributes };
};

const str = buildTag(cstml, 'String');
const num = buildTag(cstml, 'Integer');
const cst = buildTag(cstml, 'Fragment');
const re = buildTag(regex, 'Pattern');

module.exports = { str, num, cst, re, buildTag, set, getAgASTValue, TemplateParser, parse };
