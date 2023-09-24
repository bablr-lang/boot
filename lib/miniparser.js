const escapeRegex = require('escape-string-regexp');
const arrayLast = require('iter-tools-es/methods/array-last');
const isString = require('iter-tools-es/methods/is-string');
const isArray = require('iter-tools-es/methods/is-array');
const { node } = require('../symbols.js');

const isRegex = (val) => val instanceof RegExp;

const isList = (obj) => Symbol.iterator in obj && !isString(obj);

const { getPrototypeOf } = Object;

const defaultOptions = {
  monomorphic: true,
};

class TemplateParser {
  constructor(language, literals, quasis, options = defaultOptions) {
    this.langauges = [];
    this.spans = [{ type: 'Bare', guard: null }];
    this.literals = literals;
    this.quasis = quasis;
    this.literalIdx = 0;
    this.quasiIdx = 0;
    this.idx = 0;
    this.type = null;
    this.options = Object.freeze(Object.seal(options));

    this.pushLanguage(language);
  }

  eatProduction(tagType) {
    let type;
    let lang = this.language.name;
    const parts = tagType.split(':');
    if (parts.length === 1) {
      ({ 0: type } = parts);
    } else {
      ({ 0: lang, 1: type } = parts);
    }

    const { covers } = this.resolveDependent(lang);

    if (this.atQuasi && covers.get(node).has(type)) {
      const { quasi, literalsDone } = this;

      if (literalsDone) throw new Error('there must be more literals than quasis');

      this.quasiIdx++;
      this.literalIdx++;
      this.idx = 0;
      return quasi;
    } else {
      return this.eval({ lang, type });
    }
  }

  eatProductions(tagType) {
    let type;
    let lang = this.language.name;
    const parts = tagType.split(':');
    if (parts.length === 1) {
      ({ 0: type } = parts);
    } else {
      ({ 0: lang, 1: type } = parts);
    }

    const { covers } = this.resolveDependent(lang);

    if (this.atQuasi && covers.get(node).has(type)) {
      const { quasi, literalsDone } = this;

      if (literalsDone) throw new Error('there must be more literals than quasis');

      this.quasiIdx++;
      this.literalIdx++;
      this.idx = 0;
      return isList(quasi) ? (isArray(quasi) ? quasi : [...quasi]) : [quasi];
    } else {
      return [this.eval({ lang, type })];
    }
  }

  get literal() {
    return this.literals[this.literalIdx];
  }

  get quasi() {
    return this.quasis[this.quasiIdx];
  }

  get quasisDone() {
    return this.quasiIdx >= this.quasis.length;
  }

  get atQuasi() {
    return !this.slicedLiteral.length && !this.quasisDone;
  }

  get done() {
    return !this.guardedSlicedLiteral.length && !this.atQuasi;
  }

  get literalsDone() {
    return this.literalIdx >= this.literals.length;
  }

  get language() {
    return arrayLast(this.langauges).language;
  }

  get grammar() {
    return arrayLast(this.langauges).grammar;
  }

  get span() {
    return arrayLast(this.spans);
  }

  get chr() {
    return this.literal[this.idx];
  }

  get slicedLiteral() {
    const { idx, literal } = this;
    return literal.slice(idx);
  }

  get guardedSlicedLiteral() {
    const { span, slicedLiteral } = this;
    const { guard } = span;

    if (!guard) return slicedLiteral;

    const pat = new RegExp(escapeRegex(guard), 'y');
    const res = pat.exec(slicedLiteral);

    return res ? slicedLiteral.slice(0, pat.lastIndex - res[0].length) : slicedLiteral;
  }

  eval(tagType) {
    const { lang: langName, type } = tagType;
    const language = this.resolveDependent(langName);
    const embeds = language !== this.language;
    const { covers } = language;

    if (embeds) {
      this.pushLanguage(language);
    }

    const { grammar } = this;

    if (!type) throw new Error('eval requires a type');

    const result = getPrototypeOf(grammar)[type].call(grammar, this);

    if (embeds) {
      this.popLanguage();
    }

    const isNode = covers.get(node).has(type) && !covers.has(type);

    return isNode ? this.node(type, result) : result;
  }

  node(type, value) {
    const { monomorphic } = this.options;
    return monomorphic ? { type, value } : { type, ...value };
  }

  matchSticky(pattern, props) {
    const { slicedLiteral, guardedSlicedLiteral } = this;
    const { endSpan } = props;

    const source = endSpan ? slicedLiteral : guardedSlicedLiteral;

    if (isString(pattern)) {
      return source.startsWith(pattern) ? pattern : null;
    } else if (isRegex(pattern)) {
      if (!pattern.sticky) throw new Error('be sticky!');
      pattern.lastIndex = 0;

      const result = pattern.exec(source);

      return result ? result[0] : null;
    } else {
      throw new Error(`Unknown pattern type`);
    }
  }

  updateSpans(props) {
    const { startSpan, endSpan, balanced } = props;
    if (startSpan || balanced) {
      const type = startSpan || this.span.type;
      this.pushSpan({ type, guard: balanced });
    } else if (endSpan) {
      if (!this.span.guard) {
        throw new Error('Only balanced spans can be closed with endSpan');
      }
      this.popSpan();
    }
  }

  chuck(chrs) {
    for (const chr of chrs) {
      if (this.literal[this.idx - 1] !== chr) {
        throw new Error('cannot chuck: chr not found');
      }
      this.idx--;
    }
  }

  eat(pattern, props = {}) {
    const result = this.matchSticky(pattern, props, this);

    if (!result) throw new Error('miniparser: parsing failed');

    this.updateSpans(props);

    this.idx += result.length;

    return result;
  }

  match(pattern, props = {}) {
    return this.matchSticky(pattern, props, this);
  }

  eatMatch(pattern, props = {}) {
    const result = this.matchSticky(pattern, props, this);
    if (result) {
      this.updateSpans(props);

      this.idx += result.length;
    }
    return result;
  }

  pushSpan(span) {
    this.spans.push(span);
  }

  popSpan() {
    if (!this.spans.length) {
      throw new Error('no span to pop');
    }
    this.spans.pop();
  }

  resolveDependent(langName) {
    const { language } = this;
    const resolved = langName === language.name ? language : language.dependencies.get(langName);

    if (!resolved) {
      throw new Error(`Cannot resolve {langName: ${langName}} from {langName: ${language.name}}`);
    }

    return resolved;
  }

  pushLanguage(language) {
    this.langauges.push({ language, grammar: new language.grammar() });
  }

  popLanguage() {
    if (!this.langauges.length) {
      throw new Error('no language to pop');
    }
    this.langauges.pop();
  }

  replaceSpan(span) {
    this.spans.pop();
    this.spans.push(span);
  }
}

const buildTag = (language, defaultType, options = defaultOptions) => {
  const defaultTag = (literals, ...quasis) => {
    const lang = language.name;
    return new TemplateParser(language, literals, quasis, options).eval({
      lang,
      type: defaultType,
    });
  };

  return new Proxy(defaultTag, {
    apply(defaultTag, receiver, argsList) {
      return defaultTag.apply(receiver, argsList);
    },

    get(_, type) {
      return (literals, ...quasis) => {
        const lang = language.name;
        return new TemplateParser(language, literals, quasis, options).eval({ lang, type });
      };
    },
  });
};

const parse = (language, source, type, options = defaultOptions) => {
  const lang = language.name;
  return new TemplateParser(language, [source], [], options).eval({ lang, type });
};

module.exports = { defaultOptions, TemplateParser, buildTag, parse };
