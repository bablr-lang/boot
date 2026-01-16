import cstmll from './languages/cstml.js';
import spamex from './languages/spamex.js';
import regex from './languages/regex.js';
import instruction from './languages/instruction.js';

import { TemplateParser } from './miniparser.js';
import { buildEmbeddedMatcher, buildEmbeddedRegex } from '@bablr/agast-vm-helpers/builders';
import { reifyExpression } from '@bablr/agast-vm-helpers';
import { interpolate } from '@bablr/agast-helpers/template';
import { buildGapTag } from '@bablr/agast-helpers/builders';
import { buildNode } from '@bablr/agast-helpers/path';

const trees = new WeakMap();

export const buildTag = (language, defaultType) => {
  const defaultTag = (quasis, ...exprs) => {
    let tree;
    if (trees.has(quasis)) {
      tree = trees.get(quasis);
    } else {
      tree = new TemplateParser(
        language,
        quasis.raw,
        exprs.map((e) => buildNode(buildGapTag())),
      ).eatProduction({
        language: language.name,
        name: defaultType,
      });

      trees.set(quasis, tree);
    }

    if (exprs.length) {
      tree = interpolate(tree, exprs);
    }

    return tree;
  };

  return new Proxy(defaultTag, {
    apply(defaultTag, receiver, argsList) {
      return defaultTag.apply(receiver, argsList);
    },

    get(_, name) {
      const trees = new WeakMap();

      return (quasis, ...exprs) => {
        let tree;
        if (trees.has(quasis)) {
          tree = trees.get(quasis);
        } else {
          tree = new TemplateParser(
            language,
            quasis.raw,
            exprs.map((e) => buildNode(buildGapTag())),
          ).eatProduction({
            language: language.name,
            name,
          });

          trees.set(quasis, tree);
        }

        if (exprs.length) {
          tree = interpolate(tree, exprs);
        }

        return tree;
      };
    },
  });
};

export const parse = (language, type, sourceText, expressions = []) => {
  let source = Array.isArray(sourceText) ? sourceText : [sourceText];
  return new TemplateParser(language, source, expressions).eatProduction({
    language: language.name,
    type,
  });
};

export const str = buildTag(cstmll, 'String');
export const num = buildTag(cstmll, 'Integer');
export const cst = buildTag(cstmll, 'Document');
export const t_ = buildTag(cstmll, 'Tag');
export const cstml = cst;
export const spam_ = buildTag(spamex, 'PropertyMatcher');
export const re_ = buildTag(regex, 'Pattern');
export const i = buildTag(instruction, 'Call');

export const t = new Proxy(t_, {
  apply(tag, _, args) {
    return reifyExpression(tag(...args));
  },
});

export const spam = new Proxy(spam_, {
  apply(tag, _, args) {
    return buildEmbeddedMatcher(tag(...args));
  },
});

export const re = new Proxy(re_, {
  apply(tag, _, args) {
    return buildEmbeddedRegex(tag(...args));
  },
});

export { TemplateParser };
