import escapeRegex from 'escape-string-regexp';
import arrayLast from 'iter-tools-es/methods/array-last';
import isString from 'iter-tools-es/methods/is-string';
import isObject from 'iter-tools-es/methods/is-object';
import find from 'iter-tools-es/methods/find';
import every from 'iter-tools-es/methods/every';
import * as sym from '@bablr/agast-vm-helpers/symbols';
import { Match } from './match.js';
import { isRegex, isArray, getPrototypeOf } from './utils.js';
import { ReferenceTag, LiteralTag } from '@bablr/agast-helpers/symbols';
import {
  buildCloseNodeTag,
  buildLiteralTag,
  buildNodeTag,
  buildNullTag,
  buildOpenNodeTag,
  buildReferenceTag,
  buildShiftTag,
  nodeFlags,
} from '@bablr/agast-helpers/builders';
import { buildToken } from '@bablr/agast-helpers/tree';
import * as Tags from '@bablr/agast-helpers/tags';
import { buildNullNode, buildPathSegment, get, Path } from '@bablr/agast-helpers/path';
import { parseReference } from '@bablr/agast-helpers/shorthand';

const Escape = Symbol.for('Escape');

const getProduction = (grammar, type) => {
  return getPrototypeOf(grammar)[type];
};

export class TemplateParser {
  constructor(rootLanguage, quasis, expressions) {
    if (!quasis) throw new Error();

    this.rootLanguage = rootLanguage;
    this.spans = [];
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

  get matchIsFragment() {
    return false;
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

  eval(id, attrs = {}, props = {}, shift_ = null) {
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
    const isEmbedded = this.language !== this.m.parent?.resolvedLanguage;
    const { path, grammar } = this;

    if (!type) throw new Error('eval requires a type');

    if (parentPath?.node && this.atExpression && !attrs.noInterpolate && (isNode || isCover)) {
      const { quasisDone } = this;

      if (quasisDone) throw new Error('there must be more quasis than expressions');

      const result = this.expression;

      this.expressionIdx++;
      this.quasiIdx++;
      this.idx = 0;

      if (parentPath?.node && (isNode || covers.has(type))) {
        const { node } = parentPath;
        const path = parseReference(this.m.attrs.path);

        if (isArray(result)) {
          for (const value of result) {
            Path.from(node).advance(path).advance(buildNodeTag(value));
          }
        } else {
          Path.from(node)
            .advance(path)
            .advance(result ? buildNodeTag(result) : buildNullTag());
        }
      }
    } else {
      if (isEmbedded) {
        this.spans.push({ type: 'Bare', guard: null });
      }

      if (!getProduction(grammar, type)) {
        throw new Error(`Unknown production {type: ${type}}`);
      }

      // if (isNode) {
      //   let { node } = this.path;
      //   Path.from(node).advance(buildOpenNodeTag(nodeFlags, node.type));
      // }

      const result = getPrototypeOf(grammar)[type].call(grammar, this, props);

      if (isEmbedded) {
        this.spans.pop();
      }

      if (isNode) {
        const { node } = this.path;
        if (result?.attrs) {
          node.attributes = result.attrs;
          node.tags = Tags.replaceAt(
            0,
            node.tags,
            buildOpenNodeTag(nodeFlags, node.type, null, result.attrs),
          );
        }

        Path.from(node).advance(buildCloseNodeTag());

        if (parentPath?.node && !covers.has(type)) {
          const path = parseReference(this.m.attrs.path);

          Path.from(parentPath.node)
            .advance(shift_ == null ? path : buildShiftTag())
            .advance(buildNodeTag(node));
        }
      }

      if (result?.shift) {
        this.shiftProduction(result.shift);
      }
    }

    this.m = this.m.parent;

    if (this.path?.node) {
      const isTag = (child) => [LiteralTag, Escape].includes(child.type);

      const { tags } = this.path.node;

      if (find(isTag, Tags.traverse(tags)) && every(isTag, Tags.traverse(tags))) {
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
    if (id === null) {
      const path_ = parseReference(attrs.path);

      Path.from(this.node).advance(path_).advance(buildNodeTag(buildNullNode()));

      return null;
    }
    return this.eval(this.buildId(id), attrs, props);
  }

  eatHeldProduction(type, attrs) {
    if (!this.held) {
      throw new Error();
    }

    const { held, node } = this;

    this.held = null;

    const path = parseReference(attrs.path);

    Path.from(node).advance(path).advance(buildNodeTag(held));

    return held;
  }

  shiftProduction(id, attrs = {}, props = {}) {
    const { node } = this;
    // don't push a new path onto the stack

    // get the most recently produced node and detach it from its parent

    const ref = Tags.getAt(-1, node.tags).value.tags[0];

    if (!ref.value.flags.expression) throw new Error();

    if (ref.type !== ReferenceTag) {
      throw new Error();
    }

    this.held = get(buildPathSegment(ref.value.name, -1), node);

    let id_ = this.buildId(id);

    const shifted = this.eval(id_, attrs, props, 1);

    // shift(node, ref, shifted);

    return shifted;
  }

  eat(pattern, type, attrs) {
    if (type && !isString(type)) throw new Error('bad type');
    if (!isObject(attrs) || !attrs.path) throw new Error('a node must have a path');

    const { path, ..._attrs } = attrs;

    const result = this.matchSticky(pattern, attrs, this);

    if (!result) this.fail();

    this.idx += result.length;

    this.updateSpans(attrs);

    const path_ = parseReference(attrs.path);

    Path.from(this.node)
      .advance(path_)
      .advance(buildNodeTag(buildToken(type, result, _attrs)));

    return result;
  }

  // matchLiteral would be a better name
  match(pattern, attrs = {}) {
    return this.matchSticky(pattern, attrs, this);
  }

  eatMatch(pattern, type, attrs) {
    if (type && !isString(type)) throw new Error('bad type');
    if (!isObject(attrs) || !attrs.path) throw new Error('a node must have a path');

    const result = this.matchSticky(pattern, attrs, this);

    if (result) {
      this.updateSpans(attrs);

      this.idx += result.length;

      const { path, ..._attrs } = attrs;

      let path_ = parseReference(path);

      Path.from(this.node)
        .advance(path_)
        .advance(buildNodeTag(buildToken(type, result, _attrs)));
    }
    return result;
  }

  eatTrivia(pattern) {
    const result = this.matchSticky(pattern, {}, this);

    if (!result) this.fail();

    this.idx += result.length;

    Path.from(this.node)
      .advance(buildReferenceTag('#'))
      .advance(buildNodeTag(buildToken('Space', result)));

    return result;
  }

  eatMatchTrivia(pattern) {
    const result = this.matchSticky(pattern, {}, this);

    if (result) {
      this.idx += result.length;

      Path.from(this.node)
        .advance(buildReferenceTag('#'))
        .advance(buildNodeTag(buildToken('Space', result)));
    }

    return result;
  }

  eatEscape(pattern) {
    const result = this.matchSticky(pattern, {}, this);

    if (!result) this.fail();

    this.idx += result.length;

    const raw = result;
    const cooked = this.language.cookEscape(result, this.span);
    const attributes = { cooked };

    Path.from(this.node)
      .advance(buildReferenceTag('@'))
      .advance(buildNodeTag(buildToken('Escape', raw, attributes)));

    return result;
  }

  eatMatchEscape(pattern) {
    const result = this.matchSticky(pattern, {}, this);

    if (result) {
      this.idx += result.length;

      const raw = result;
      const cooked = this.language.cookEscape(result, this.span);
      const attributes = { cooked };

      Path.from(this.node)
        .advance(buildReferenceTag('@'))
        .advance(buildNodeTag(buildToken('Escape', raw, attributes)));
    }

    return result;
  }

  eatLiteral(pattern) {
    const result = this.matchSticky(pattern, {}, this);

    if (!result) this.fail();

    this.idx += result.length;

    this.node.tags = Tags.push(this.node.tags, buildLiteralTag(result));
    this.node.children = this.node.tags[1][1];

    return result;
  }

  eatMatchLiteral(pattern) {
    const result = this.matchSticky(pattern, {}, this);

    if (result) {
      this.idx += result.length;

      this.node.tags = Tags.push(this.node.tags, buildLiteralTag(result));
      this.node.children = this.node.tags[1][1];
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

  fail() {
    throw new Error(`miniparser: parsing \`${this.quasis}\` failed`);
  }
}
