const escapeRegex = require('escape-string-regexp');
const arrayLast = require('iter-tools-es/methods/array-last');
const isString = require('iter-tools-es/methods/is-string');
const isObject = require('iter-tools-es/methods/is-object');
const sym = require('./symbols.js');
const { Match } = require('./match.js');
const { set, isRegex, parsePath, getPrototypeOf } = require('./utils.js');

class TemplateParser {
  constructor(rootLanguage, quasis, expressions) {
    this.rootLanguage = rootLanguage;
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

  get node() {
    return this.path.node;
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

  gapFrom(type, attrs) {
    let production;
    let language = this.language.name;
    const parts = type.split(':');
    if (parts.length === 1) {
      ({ 0: production } = parts);
    } else {
      ({ 0: language, 1: production } = parts);
    }

    const type_ = { language, production };

    return { type: 'Gap', type: type_, attrs };
  }

  matchSticky(pattern, attrs) {
    const { slicedQuasi, guardedSlicedQuasi } = this;
    const { balancer } = attrs;

    const source = balancer ? slicedQuasi : guardedSlicedQuasi;

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

  eval(gap) {
    const parentMatch = this.m;
    const parentPath = this.path;
    const { type } = gap;
    const { production } = type;

    if (parentMatch) {
      this.m = parentMatch.generate(gap);
    } else {
      this.m = Match.from(this.rootLanguage, gap);
    }

    const { children, properties } = this.node;
    const { covers } = this.m.language;
    const isNode = covers.get(sym.node).has(production) && !covers.has(production);
    const { path } = this;
    const { parentProperty } = path;

    const { grammar } = this;

    if (!production) throw new Error('eval requires a production');

    if (this.atExpression && covers.get(sym.node).has(production)) {
      const { quasisDone } = this;

      if (quasisDone) throw new Error('there must be more quasis than expressions');

      this.expressionIdx++;
      this.quasiIdx++;
      this.idx = 0;

      if (parentPath.node.children && isNode) {
        parentPath.node.children.push({ type: 'Gap', value: parentProperty });
        set(parentPath.node.properties, parentProperty, null);
      }
    } else {
      const result = getPrototypeOf(grammar)[production].call(grammar, this, gap.attrs);

      const attrs = result?.attrs || {};

      const node = { type, children, properties, attrs, gap: undefined };

      if (parentPath?.node.children && isNode) {
        parentPath.node.children.push({ type: 'Reference', value: parentProperty });
        set(parentPath.node.properties, parentProperty, node);
      }
    }

    this.m = this.m.parent;

    if (this.path) {
      const isTerminal = (child) => ['String', 'Escape'].includes(child.type);

      if (children.find(isTerminal) && !children.every(isTerminal)) {
        throw new Error('strings must be wrapped in nodes');
      }
    }

    return path.node;
  }

  updateSpans(attrs) {
    const { startSpan, endSpan, balanced, balancer } = attrs;
    if (endSpan || balancer) {
      if (!this.span.guard) {
        throw new Error('Only balanced spans can be closed with endSpan');
      }
      this.popSpan();
    }
    if (startSpan || balanced) {
      const type = startSpan || this.span.type;
      this.pushSpan({ type, guard: balanced });
    }
  }

  eatProduction(type, attrs = {}) {
    return this.eval(this.gapFrom(type, attrs));
  }

  eatHeldProduction(type, attrs) {
    const { children, properties } = this.node;

    if (!this.held) {
      throw new Error();
    }

    const { held } = this;

    this.held = null;

    children.push({ type: 'Reference', value: attrs.path });
    set(properties, attrs.path, held);

    return held;
  }

  shiftProduction(type, attrs = {}) {
    const { children, properties } = this.node;
    // don't push a new path onto the stack

    // get the most recently produced node and detach it from its parent

    const gap = this.gapFrom(type, attrs);

    const lastChild = arrayLast(children);

    if (!['Reference', 'Gap'].includes(lastChild.type)) {
      throw new Error();
    }

    const { pathIsArray, pathName } = parsePath(lastChild.value);

    this.held = pathIsArray ? arrayLast(properties[pathName]) : properties[pathName];

    children.pop();

    if (pathIsArray) {
      properties[pathName].pop();
    } else {
      properties[pathName] = null;
    }

    return this.eval(gap);
  }

  eat(pattern, production, attrs) {
    if (!isString(production)) throw new Error('Cannot eat anonymous token');
    if (!isObject(attrs) || !attrs.path) throw new Error('a node must have a path');

    const result = this.matchSticky(pattern, attrs, this);

    if (!result) throw new Error('miniparser: parsing failed');

    this.updateSpans(attrs);

    this.idx += result.length;

    set(this.node.properties, attrs.path, {
      type: { language: this.language.name, production },
      children: [result],
      attrs: {},
      gap: undefined,
    });
    this.node.children.push({
      type: 'Reference',
      value: attrs.path,
    });

    return result;
  }

  match(pattern, attrs = {}) {
    return this.matchSticky(pattern, attrs, this);
  }

  eatMatch(pattern, production, attrs) {
    if (!isString(production)) throw new Error('Cannot eatMatch anonymous token');
    if (!isObject(attrs) || !attrs.path) throw new Error('a node must have a path');

    const result = this.matchSticky(pattern, attrs, this);
    if (result) {
      this.updateSpans(attrs);

      this.idx += result.length;

      set(this.node.properties, attrs.path, {
        type: { language: this.language.name, production },
        children: [result],
        attrs: {},
        gap: undefined,
      });
      this.node.children.push({
        type: 'Reference',
        value: attrs.path,
      });
    }
    return result;
  }

  eatTrivia(pattern) {
    const result = this.matchSticky(pattern, {}, this);

    if (!result) throw new Error('miniparser: parsing failed');

    this.idx += result.length;

    this.node.children.push({
      type: 'Trivia',
      value: result,
    });

    return result;
  }

  eatMatchTrivia(pattern) {
    const result = this.matchSticky(pattern, {}, this);

    if (result) {
      this.idx += result.length;

      this.node.children.push({
        type: 'Trivia',
        value: result,
      });
    }

    return result;
  }

  chuck(chrs) {
    const lastChild = arrayLast(this.node.children);
    if (!['String', 'Trivia'].includes(lastChild.type) || chrs.length > lastChild.value.length) {
      throw new Error('Cannot chuck, parser has moved on');
    }

    const token = lastChild;

    if (token.value.slice(-chrs.length) !== chrs) {
      throw new Error('Cannot chuck, not matching');
    }
    this.idx -= chrs.length;
    token.value = token.value.slice(0, -chrs.length);
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

  replaceSpan(span) {
    this.spans.pop();
    this.spans.push(span);
  }
}

module.exports = { TemplateParser };
