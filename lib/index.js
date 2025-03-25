import * as cstmll from './languages/cstml.js';
import * as spamex from './languages/spamex.js';
import * as regex from './languages/regex.js';
import * as instruction from './languages/instruction.js';

import { TemplateParser } from './miniparser.js';
import { buildEmbeddedMatcher, buildEmbeddedRegex } from '@bablr/agast-vm-helpers/builders';

export const buildTag = (language, defaultType) => {
  const defaultTag = (quasis, ...exprs) => {
    return new TemplateParser(language, quasis.raw, exprs).eval({
      language: language.name,
      type: defaultType,
    });
  };

  return new Proxy(defaultTag, {
    apply(defaultTag, receiver, argsList) {
      return defaultTag.apply(receiver, argsList);
    },

    get(_, type) {
      return (quasis, ...exprs) => {
        return new TemplateParser(language, quasis.raw, exprs).eval({
          language: language.name,
          type,
        });
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

export const str = buildTag(cstmll, 'String');
export const num = buildTag(cstmll, 'Integer');
export const cst = buildTag(cstmll, 'Node');
export const cstml = cst;
export const spam_ = buildTag(spamex, 'Matcher');
export const re_ = buildTag(regex, 'Pattern');
export const i = buildTag(instruction, 'Call');

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
