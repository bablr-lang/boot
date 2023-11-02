const escapeRegex = require('escape-string-regexp');
const arrayLast = require('iter-tools-es/methods/array-last');
const isString = require('iter-tools-es/methods/is-string');
const isObject = require('iter-tools-es/methods/is-object');
const sym = require('./symbols.js');
const { Match } = require('./match.js');
const { set, isRegex, parsePath, getPrototypeOf, buildNode } = require('./utils.js');

const str = (value) => ({ type: 'String', value });
const ref = (value) => ({ type: 'Reference', value });
const esc = (raw, cooked) => ({ type: 'Escape', value: { raw, cooked } });
const trivia = (value) => ({ type: 'Trivia', value });

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
    return this.m.resolvedLanguage;
  }

  get grammar() {
    return this.m.grammar;
  }

  get matchIsNode() {
    return this.language.covers.get(sym.node).has(this.m.type) && !this.matchIsCover;
  }

  get matchIsCover() {
    return this.language.covers.has(this.m.type);
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

  eval(id, attrs = {}, props = {}) {
    const parentMatch = this.m;
    const parentPath = this.path?.node ? this.path : this.path?.parent;
    const { type } = id;

    if (parentMatch && this.matchIsNode) {
      if (this.matchIsCover && Object.keys(attrs).length) {
        throw new Error('Attrs cannot be passed from inside covers');
      }
    }

    if (parentMatch) {
      this.m = parentMatch.generate(id, attrs);
    } else {
      this.m = Match.from(this.rootLanguage, id, attrs);
    }

    const { covers } = this.language;
    const isNode = this.matchIsNode;
    const isCover = this.matchIsCover;
    const { path, grammar } = this;

    if (!type) throw new Error('eval requires a type');

    if (parentPath?.node && this.atExpression && (isNode || isCover)) {
      const { quasisDone } = this;

      if (quasisDone) throw new Error('there must be more quasis than expressions');

      this.expressionIdx++;
      this.quasiIdx++;
      this.idx = 0;

      if (parentPath?.node && (isNode || covers.has(type))) {
        parentPath.node.children.push({ type: 'Reference', value: this.m.attrs.path, id });
        set(parentPath.node.properties, this.m.attrs.path, null);
      }
    } else {
      const result = getPrototypeOf(grammar)[type].call(grammar, this, props);

      if (isNode) {
        const { node } = this.path;
        if (result?.attrs) {
          node.attributes = result.attrs;
        }
        if (parentPath?.node && !covers.has(type)) {
          parentPath.node.children.push(ref(this.m.attrs.path));
          set(parentPath.node.properties, this.m.attrs.path, node);
        }
      }
    }

    this.m = this.m.parent;

    if (this.path?.node) {
      const isTerminal = (child) => ['String', 'Escape'].includes(child.type);

      const { children } = this.path.node;

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

  buildId(id) {
    let type;
    let language = this.language.name;

    if (id.includes(':')) {
      ({ 0: language, 1: type } = id.split(':'));
    } else {
      type = id;
    }

    return { type, language };
  }

  eatProduction(id, attrs = {}, props = {}) {
    return this.eval(this.buildId(id), attrs, props);
  }

  eatHeldProduction(type, attrs) {
    const { children, properties } = this.node;

    if (!this.held) {
      throw new Error();
    }

    const { held } = this;

    this.held = null;

    children.push(ref(attrs.path));
    set(properties, attrs.path, held);

    return held;
  }

  shiftProduction(id, attrs = {}, props = {}) {
    const { children, properties } = this.node;
    // don't push a new path onto the stack

    // get the most recently produced node and detach it from its parent

    const lastChild = arrayLast(children);

    if (lastChild.type !== 'Reference') {
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

    return this.eval(this.buildId(id), attrs, props);
  }

  eat(pattern, type, attrs) {
    if (!isString(type)) throw new Error('Cannot eat anonymous token');
    if (!isObject(attrs) || !attrs.path) throw new Error('a node must have a path');

    const result = this.matchSticky(pattern, attrs, this);

    if (!result) throw new Error('miniparser: parsing failed');

    this.updateSpans(attrs);

    this.idx += result.length;

    set(this.node.properties, attrs.path, buildNode(this.buildId(type), [str(result)]));

    this.node.children.push(ref(attrs.path));

    return result;
  }

  match(pattern, attrs = {}) {
    return this.matchSticky(pattern, attrs, this);
  }

  eatMatch(pattern, type, attrs) {
    if (!isString(type)) throw new Error('Cannot eatMatch anonymous token');
    if (!isObject(attrs) || !attrs.path) throw new Error('a node must have a path');

    const result = this.matchSticky(pattern, attrs, this);
    if (result) {
      this.updateSpans(attrs);

      this.idx += result.length;

      set(this.node.properties, attrs.path, buildNode(this.buildId(type), [str(result)]));

      this.node.children.push(ref(attrs.path));
    }
    return result;
  }

  eatTrivia(pattern) {
    const result = this.matchSticky(pattern, {}, this);

    if (!result) throw new Error('miniparser: parsing failed');

    this.idx += result.length;

    this.node.children.push(trivia(result));

    return result;
  }

  eatMatchTrivia(pattern) {
    const result = this.matchSticky(pattern, {}, this);

    if (result) {
      this.idx += result.length;

      this.node.children.push(trivia(result));
    }

    return result;
  }

  eatEscape(pattern) {
    const result = this.matchSticky(pattern, {}, this);

    if (!result) throw new Error('miniparser: parsing failed');

    this.idx += result.length;

    this.node.children.push(esc(result, this.language.cookEscape(result, this.span)));

    return result;
  }

  eatMatchEscape(pattern) {
    const result = this.matchSticky(pattern, {}, this);

    if (result) {
      this.idx += result.length;

      this.node.children.push(esc(result, this.language.cookEscape(result, this.span)));
    }

    return result;
  }

  eatStr(pattern) {
    const result = this.matchSticky(pattern, {}, this);

    if (!result) throw new Error('miniparser: parsing failed');

    this.idx += result.length;

    this.node.children.push(str(result));

    return result;
  }

  eatMatchStr(pattern) {
    const result = this.matchSticky(pattern, {}, this);

    if (result) {
      this.idx += result.length;

      this.node.children.push(str(result));
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

  replaceSpan(span) {
    this.spans.pop();
    this.spans.push(span);
  }
}

module.exports = { TemplateParser };
