import * as cstmll from './languages/cstml.js';
import * as spamex from './languages/spamex.js';
import * as regex from './languages/regex.js';
import * as instruction from './languages/instruction.js';
import {
  nodeFlags,
  buildDoctypeTag,
  buildOpenNodeTag,
  buildCloseNodeTag,
  buildFragmentOpenTag,
  buildFragmentCloseTag,
  buildReferenceTag,
  buildGapTag,
  buildArrayInitializerTag,
} from '@bablr/agast-helpers/builders';
import { buildToken } from '@bablr/helpers/builders';
import { TemplateParser } from './miniparser.js';
import {
  OpenNodeTag,
  CloseNodeTag,
  ReferenceTag,
  EmbeddedNode,
} from '@bablr/agast-helpers/symbols';
import * as btree from '@bablr/agast-helpers/btree';
import { Resolver, treeFromStreamSync as treeFromStream } from '@bablr/agast-helpers/tree';
import { PathResolver } from './path.js';
import { add } from './utils.js';

const Trivia = Symbol.for('Trivia');
const Escape = Symbol.for('Escape');

const { isArray } = Array;
const { hasOwn } = Object;

export const buildTag = (language, defaultType) => {
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

export const parse = (language, type, sourceText) => {
  return new TemplateParser(language, [sourceText], []).eval({
    language: language.name,
    type,
  });
};

export const getAgASTTree = (language, miniNode) => {
  const attributes = { bablrLanguage: language.canonicalURL };
  const ref = buildReferenceTag('.');
  return {
    flags: nodeFlags,
    language: language.canonicalURL,
    type: null,
    children: [
      buildDoctypeTag(attributes),
      buildFragmentOpenTag(nodeFlags, null, null, null),
      ref,
      buildGapTag(),
      buildFragmentCloseTag(),
    ],
    properties: { ['.']: { ref, node: getAgASTValue(language, miniNode) } },
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
    // escape: !!miniNode.flags?.escape,
    // trivia: !!miniNode.flags?.trivia,
    token: false,
    hasGap: false,
  };
  const properties = {};
  let children = [];
  const resolver = new PathResolver(miniNode);
  const resolvedLanguage =
    languageName !== language.name ? language.dependencies[languageName] : language;

  if (!languageName) {
    miniNode.language;
  }

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
    type === 'Space' ||
    miniNode.flags?.token
  ) {
    flags.token = true;
  }

  children = btree.push(
    children,
    buildOpenNodeTag(flags, resolvedLanguage.canonicalURL, type, attributes),
  );

  for (const child of miniNode.children) {
    if (child.type === OpenNodeTag || child.type === CloseNodeTag) {
      continue;
    } else if (child.type === ReferenceTag) {
      const path = child.value;
      const { name, isArray } = path;
      let node = resolver.get(child.value);

      if (node === undefined) throw new Error();

      const agASTNode =
        node === null ? treeFromStream([buildGapTag()]) : getAgASTValue(resolvedLanguage, node);

      if (isArray && !hasOwn(properties, name)) {
        const newRef = buildReferenceTag(name, isArray);
        const arrayTag = buildArrayInitializerTag();

        children = btree.push(children, newRef);
        children = btree.push(children, arrayTag);

        add(properties, buildReferenceTag(name, isArray), []);
      }

      add(properties, child, agASTNode);
      children = btree.push(children, buildReferenceTag(name, isArray));
      children = btree.push(children, buildGapTag());
    } else if (child.type === Trivia) {
      children = btree.push(children, buildReferenceTag('#', false));
      children = btree.push(children, {
        type: EmbeddedNode,
        value: getAgASTValue(resolvedLanguage, buildToken(languageName, 'Space', child.value)),
      });
    } else if (child.type === Escape) {
      const { cooked, raw } = child.value;
      const attributes = { cooked };

      children = btree.push(children, buildReferenceTag('@', false));
      children = btree.push(children, {
        type: EmbeddedNode,
        value: getAgASTValue(resolvedLanguage, buildToken(languageName, 'Escape', raw, attributes)),
      });
    } else {
      children = btree.push(children, child);
    }
  }

  children = btree.push(children, buildCloseNodeTag());

  return {
    flags,
    language: resolvedLanguage.canonicalURL,
    type: typeof type === 'string' ? Symbol.for(type) : type,
    children,
    properties,
    attributes,
  };
};

export const str = buildTag(cstmll, 'String');
export const num = buildTag(cstmll, 'Integer');
export const cst = buildTag(cstmll, 'Node');
export const cstml = cst;
export const spam = buildTag(spamex, 'Matcher');
export const re = buildTag(regex, 'Pattern');
export const i = buildTag(instruction, 'Call');

export { TemplateParser, Resolver };
