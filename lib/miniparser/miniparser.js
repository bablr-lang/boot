const escapeRegex = require('escape-string-regexp');
const arrayLast = require('iter-tools-es/methods/array-last');
const isString = require('iter-tools-es/methods/is-string');
const { node, gap } = require('../symbols.js');
const { Match } = require('./match.js');

const isRegex = (val) => val instanceof RegExp;
const { getPrototypeOf } = Object;

class TemplateParser {
  constructor(quasis, expressions) {
    this.spans = [{ type: 'Bare', guard: null }];
    this.quasis = quasis;
    this.expressions = expressions;
    this.quasiIdx = 0;
    this.expressionIdx = 0;
    this.idx = 0;
    this.type = null;
    this.m = null;
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

  get path() {
    return this.m?.path;
  }

  get language() {
    return this.m.language;
  }

  get grammar() {
    return this.m.grammar;
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

  eatProduction(tagType, attrs = {}) {
    let type;
    let langName = this.language.name;
    const parts = tagType.split(':');
    if (parts.length === 1) {
      ({ 0: type } = parts);
    } else {
      ({ 0: langName, 1: type } = parts);
    }

    const tagName = { parser: langName, production: type };
    const gap = { type: 'Gap', tagName, attrs };

    return this.eval(gap);
  }

  eval(gap) {
    const parentMatch = this.m;
    const parentPath = this.path;
    const { attrs, langName } = gap;
    const { parser, production: type } = langName;
    const language = this.resolveDependent(parser);
    const { covers } = language;
    const isNode = covers.get(node).has(type) && !covers.has(type);

    this.m = parentMatch
      ? parentMatch.generate(
          language,
          type,
          isNode ? parentMatch.path.generate(attrs.path) : undefined,
        )
      : Match.from(language, type);

    const { grammar } = this;

    if (!type) throw new Error('eval requires a type');

    let returnValue;
    if (this.atExpression && covers.get(node).has(type)) {
      const { quasisDone } = this;

      if (quasisDone) throw new Error('there must be more quasis than expressions');

      this.expressionIdx++;
      this.quasiIdx++;
      this.idx = 0;

      if (parentPath.children) {
        parentPath.children.push(gap);
      }

      returnValue = gap;
    } else {
      const result = getPrototypeOf(grammar)[type].call(grammar, this);

      const attrs = result?.attrs || {};

      if (parentPath?.children && isNode) {
        parentPath.children.push({ type: 'ReferenceTag' });
      }

      const { children, properties } = this.path;

      returnValue = isNode ? { tagName: type, children, properties, attrs, gap } : result;
    }

    if (isNode) {
      const { resolver, properties } = this.path;

      let result;
      if ((result = /\[\s*(\w+)\s*\]/.exec(attrs.path))) {
        properties[attrs.path][resolver.resolve(result[1])];
      } else {
        properties[attrs.path] = returnValue;
      }
    }

    this.m = this.m.parent;

    return returnValue;
  }

  matchSticky(pattern, attrs) {
    const { slicedQuasi, guardedSlicedQuasi } = this;
    const { endSpan } = attrs;

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

  updateSpans(attrs) {
    const { startSpan, endSpan, balanced } = attrs;
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
    const lastChild = arrayLast(this.path.children);
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

  eat(pattern, attrs = {}) {
    const result = this.matchSticky(pattern, attrs, this);

    if (!result) throw new Error('miniparser: parsing failed');

    this.updateSpans(attrs);

    this.idx += result.length;

    this.path.children.push({
      type: 'TokenTag',
      value: { tagName: 'Token', value: result, attrs },
    });

    return result;
  }

  match(pattern, attrs = {}) {
    return this.matchSticky(pattern, attrs, this);
  }

  eatMatch(pattern, attrs = {}) {
    const result = this.matchSticky(pattern, attrs, this);
    if (result) {
      this.updateSpans(attrs);

      this.idx += result.length;

      this.path.children.push({
        type: 'TokenTag',
        value: { tagName: 'Token', value: result, attrs },
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

  replaceSpan(span) {
    this.spans.pop();
    this.spans.push(span);
  }
}

module.exports = { TemplateParser };