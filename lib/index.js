const { PathResolver } = require('@bablr/boot-helpers/path');
const cstml = require('./languages/cstml.js');
const spamex = require('./languages/spamex.js');
const regex = require('./languages/regex.js');
const instruction = require('./languages/instruction.js');
const {
  buildLiteralTag,
  buildDoctypeTag,
  buildNodeOpenTag,
  buildNodeCloseTag,
  buildFragmentOpenTag,
  buildFragmentCloseTag,
  buildTriviaNode,
  buildGapNode,
  buildSyntacticEscapeNode,
  nodeFlags,
  buildReferenceTag,
} = require('./builders.js');
const { TemplateParser } = require('./miniparser.js');
const { Resolver } = require('./print.js');
const {
  OpenNodeTag,
  CloseNodeTag,
  ReferenceTag,
  ArrayTag,
  EmbeddedNode,
  Trivia,
  Escape,
} = require('@bablr/boot-helpers/symbols');
const btree = require('@bablr/boot-helpers/btree');

const { isArray } = Array;
const { hasOwn } = Object;

const get = (node, path) => {
  const { type, properties } = node;
  const { 1: name, 2: index } = /^([^\.]+)(?:\.(\d+))?/.exec(path) || [];

  if (!hasOwn(properties, name)) {
    throw new Error(`Cannot find {name: ${name}} on node of {type: ${type}}`);
  }

  if (index != null) {
    return properties[name]?.[parseInt(index, 10)];
  } else {
    return properties[name];
  }
};

const add = (obj, path, value) => {
  const { name, isArray: pathIsArray } = path;
  if (pathIsArray) {
    if (!obj[name]) {
      obj[name] = [];
    }

    if (!isArray(obj[name])) throw new Error('bad array value');

    obj[name] = btree.push(obj[name], value);
  } else {
    if (hasOwn(obj, name)) {
      throw new Error('duplicate child name');
    }
    obj[name] = value;
  }
};

const buildTag = (language, defaultType) => {
  const defaultTag = (quasis, ...exprs) => {
    return getAgASTTree(
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
        return getAgASTTree(
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

const getAgASTTree = (language, miniNode) => {
  const attributes = { 'bablr-language': language.canonicalURL };
  return {
    flags: nodeFlags,
    language: language.canonicalURL,
    type: null,
    children: [
      buildDoctypeTag(attributes),
      buildFragmentOpenTag(nodeFlags, null, null, null),
      buildReferenceTag('.'),
      buildFragmentCloseTag(),
    ],
    properties: { ['.']: getAgASTValue(language, miniNode) },
    attributes,
  };
};

const getAgASTValue = (language, miniNode) => {
  if (!miniNode) return miniNode;

  if (isArray(miniNode)) {
    return miniNode.map((node) => getAgASTValue(node));
  }

  const { language: languageName, type, attributes } = miniNode;
  const flags = {
    escape: !!miniNode.flags?.escape,
    trivia: !!miniNode.flags?.trivia,
    token: false,
    hasGap: false,
  };
  const properties = {};
  let children = [];
  const resolver = new PathResolver(miniNode);
  const resolvedLanguage =
    languageName !== language.name ? language.dependencies[languageName] : language;

  if (languageName.startsWith('https://')) {
    return miniNode; // This node is already processed, possibly because it was interpolated
  }

  if (!resolvedLanguage) {
    throw new Error();
  }

  if (
    type === 'Punctuator' ||
    type === 'Keyword' ||
    type === 'Identifier' ||
    type === 'StringContent' ||
    type === 'Escape' ||
    miniNode.flags?.syntactic
  ) {
    flags.token = true;
  }

  children = btree.push(
    children,
    buildNodeOpenTag(flags, resolvedLanguage.canonicalURL, type, attributes),
  );

  for (const child of miniNode.children) {
    if (child.type === OpenNodeTag || child.type === CloseNodeTag) {
      continue;
    } else if (child.type === ReferenceTag) {
      const path = child.value;
      const { name, isArray } = path;
      let node = resolver.get(child.value);

      if (node === undefined) throw new Error();

      const agASTNode = node === null ? buildGapNode() : getAgASTValue(resolvedLanguage, node);

      if (isArray && !hasOwn(properties, name)) {
        const newRef = { type: ReferenceTag, value: { name, isArray } };
        const arrayTag = { type: ArrayTag, value: undefined };

        children = btree.push(children, newRef);
        children = btree.push(children, arrayTag);

        add(properties, { name }, []);
      }

      add(properties, path, agASTNode);
      children = btree.push(children, { type: ReferenceTag, value: { name, isArray } });
    } else if (child.type === Trivia) {
      children = btree.push(children, {
        type: EmbeddedNode,
        value: getAgASTValue(
          resolvedLanguage,
          buildTriviaNode(languageName, 'Space', [buildLiteralTag(child.value)]),
        ),
      });
    } else if (child.type === Escape) {
      const { cooked, raw } = child.value;
      const attributes = { cooked };

      children = btree.push(children, {
        type: EmbeddedNode,
        value: getAgASTValue(
          resolvedLanguage,
          buildSyntacticEscapeNode(languageName, 'Escape', [buildLiteralTag(raw)], {}, attributes),
        ),
      });
    } else {
      if (child.type === ArrayTag) throw new Error('badbad');
      children = btree.push(children, child);
    }
  }

  children = btree.push(children, buildNodeCloseTag());

  return { flags, language: resolvedLanguage.canonicalURL, type, children, properties, attributes };
};

const str = buildTag(cstml, 'String');
const num = buildTag(cstml, 'Integer');
const cst = buildTag(cstml, 'Node');
const spam = buildTag(spamex, 'Matcher');
const re = buildTag(regex, 'Pattern');
const i = buildTag(instruction, 'Call');

module.exports = {
  str,
  num,
  cst,
  spam,
  re,
  i,
  buildTag,
  get,
  add,
  getAgASTValue,
  TemplateParser,
  Resolver,
  parse,
};
