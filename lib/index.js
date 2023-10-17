const instruction = require('./languages/instruction.js');
const regex = require('./languages/regex.js');
const spamex = require('./languages/spamex.js');
const { TemplateParser } = require('./miniparser.js');

const buildTag = (language, defaultType) => {
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

const i = buildTag(instruction, 'Call');
const spam = buildTag(spamex, 'Matchable');
const re = buildTag(regex, 'Pattern');

module.exports = { re, spam, i };
