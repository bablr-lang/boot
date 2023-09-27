const escapeRegex = require('escape-string-regexp');
const arrayLast = require('iter-tools-es/methods/array-last');
const isString = require('iter-tools-es/methods/is-string');
const { node, gap } = require('./symbols.js');

const isRegex = (val) => val instanceof RegExp;

const { getPrototypeOf } = Object;

class TemplateParser {
  constructor(language, quasis, expressions) {
    this.langauges = [];
    this.spans = [{ type: 'Bare', guard: null }];
    this.quasis = quasis;
    this.expressions = expressions;
    this.quasiIdx = 0;
    this.expressionIdx = 0;
    this.idx = 0;
    this.type = null;
    this.childrens = []; // a stack of children arrays

    this.pushLanguage(language);
  }

  get quasi() {
    return this.quasis[this.quasiIdx];
  }

  get expression() {
    return this.expressions[this.expressionIdx];
  }

  get expressionsDone() {
    return this.expressionIdx >= this.expressions.length;
  }

  get atExpression() {
    return !this.slicedQuasi.length && !this.expressionsDone;
  }

  get done() {
    return !this.guardedSlicedQuasi.length && !this.atExpression;
  }

  get quasisDone() {
    return this.quasiIdx >= this.quasis.length;
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
    return this.quasi[this.idx];
  }

  get slicedQuasi() {
    const { idx, quasi } = this;
    return quasi.slice(idx);
  }

  get guardedSlicedQuasi() {
    const { span, slicedQuasi } = this;
    const { guard } = span;

    if (!guard) return slicedQuasi;

    const pat = new RegExp(escapeRegex(guard), 'y');
    const res = pat.exec(slicedQuasi);

    return res ? slicedQuasi.slice(0, pat.lastIndex - res[0].length) : slicedQuasi;
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

    return this.eval({ lang, type });
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

    return [this.eval({ lang, type })];
  }

  eval(tagType) {
    const { lang: langName, type } = tagType;
    const language = this.resolveDependent(langName);
    const embeds = language !== this.language;
    const { covers } = language;
    const parentChildren = arrayLast(this.childrens);
    const children = [];
    const isNode = covers.get(node).has(type) && !covers.has(type);

    if (isNode) {
      this.childrens.push(children);
    }

    if (embeds) {
      this.pushLanguage(language);
    }

    const { grammar } = this;

    if (!type) throw new Error('eval requires a type');

    let returnValue;
    if (this.atExpression && isNode) {
      const { quasisDone } = this;

      if (quasisDone) throw new Error('there must be more quasis than expressions');

      this.expressionIdx++;
      this.quasiIdx++;
      this.idx = 0;

      if (parentChildren) {
        parentChildren.push({ type: 'GapNodeTag' });
      }

      returnValue = gap;
    } else {
      const result = getPrototypeOf(grammar)[type].call(grammar, this);

      if (embeds) {
        this.popLanguage();
      }

      if (parentChildren && isNode) {
        parentChildren.push({ type: 'ReferenceTag' });
      }

      returnValue = isNode ? { type, children, properties: result } : result;
    }

    if (isNode) {
      this.childrens.pop();
    }

    return returnValue;
  }

  matchSticky(pattern, props) {
    const { slicedQuasi, guardedSlicedQuasi } = this;
    const { endSpan } = props;

    const source = endSpan ? slicedQuasi : guardedSlicedQuasi;

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
    const lastChild = arrayLast(arrayLast(this.childrens));
    if (lastChild.type !== 'TokenTag' || chrs.length > lastChild.value.value.length) {
      throw new Error('Cannot chuck, parser has moved on');
    }

    const token = lastChild.value;

    if (token.value.slice(-chrs.length) !== chrs) {
      throw new Error('Cannot chuck, not matching');
    }
    this.idx -= chrs.length;
    token.value = token.value.slice(0, -chrs.length);
  }

  eat(pattern, props = {}) {
    const result = this.matchSticky(pattern, props, this);

    if (!result) throw new Error('miniparser: parsing failed');

    this.updateSpans(props);

    this.idx += result.length;

    arrayLast(this.childrens).push({
      type: 'TokenTag',
      value: { tagName: 'Token', value: result },
    });

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

      arrayLast(this.childrens).push({
        type: 'TokenTag',
        value: { tagName: 'Token', value: result },
      });
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

const buildTag = (language, defaultType) => {
  const defaultTag = (quasis, ...expressions) => {
    const lang = language.name;
    return new TemplateParser(language, quasis.raw, expressions).eval({
      lang,
      type: defaultType,
    });
  };

  return new Proxy(defaultTag, {
    apply(defaultTag, receiver, argsList) {
      return defaultTag.apply(receiver, argsList);
    },

    get(_, type) {
      return (quasis, ...expressions) => {
        const lang = language.name;
        return new TemplateParser(language, quasis.raw, expressions).eval({
          lang,
          type,
        });
      };
    },
  });
};

const parse = (language, source, type) => {
  const lang = language.name;
  return new TemplateParser(language, [source], []).eval({ lang, type });
};

module.exports = { TemplateParser, buildTag, parse };
