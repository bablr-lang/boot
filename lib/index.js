const cstml = require('./languages/cstml.js');
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

const parse = (language, type, sourceText) => {
  return new TemplateParser(language, [sourceText], []).eval({
    language: language.name,
    type,
  });
};

const str = buildTag(cstml, 'String');
const num = buildTag(cstml, 'Integer');
const cst = buildTag(cstml, 'Fragment');

module.exports = { str, num, cst, buildTag, TemplateParser, parse };
