import escapeRegex from 'escape-string-regexp';
import { Match } from './match.js';
import { isRegex, isArray, getPrototypeOf } from './utils.js';
import { ReferenceTag, LiteralTag } from '@bablr/agast-helpers/symbols';
import { deepFreezeRecord, isObject, isString, arrayLast } from '@bablr/agast-helpers/object';
import {
  buildCloseNodeTag,
  buildFullOpenNodeTag,
  buildLiteralTag,
  buildNullTag,
  buildReferenceTag,
  nodeFlags,
  parseTag,
} from '@bablr/agast-helpers/builders';
import { buildToken } from '@bablr/agast-helpers/tree';
import * as Tags from '@bablr/agast-helpers/tags';
import { buildNode, buildNullNode, buildPathSegment, get, Path } from '@bablr/agast-helpers/path';

let getProduction = (grammar, type) => {
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
    this.held = null;
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
    return (
      this.language.covers.get(Symbol.for('@bablr/node')).has(this.m.name) && !this.matchIsCover
    );
  }

  get matchIsCover() {
    return this.language.covers.has(this.m.name);
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
    let { idx, quasi } = this;
    return quasi.slice(idx);
  }

  get guardedSlicedQuasi() {
    let { span, slicedQuasi } = this;
    let { guard } = span;

    if (!guard) return slicedQuasi;

    let pat = new RegExp(escapeRegex(guard), 'y');
    let res = pat.exec(slicedQuasi);

    return res ? slicedQuasi.slice(0, pat.lastIndex - res[0].length) : slicedQuasi;
  }

  matchSticky(pattern, attrs) {
    let { slicedQuasi, guardedSlicedQuasi } = this;
    let { balancer } = attrs;

    let source = balancer ? slicedQuasi : guardedSlicedQuasi;

    if (isString(pattern)) {
      return source.startsWith(pattern) ? pattern : null;
    } else if (isRegex(pattern)) {
      if (!pattern.sticky) throw new Error('be sticky!');
      pattern.lastIndex = 0;

      let result = pattern.exec(source);

      return result ? result[0] : null;
    } else {
      throw new Error(`Unknown pattern type`);
    }
  }

  eatProduction(_id, attrs = {}, props = {}, shift_ = null) {
    if (_id === null) {
      let path_ = attrs.path;

      this.path.node = Path.from(this.node).advance(path_).advance(buildNullNode()).node;

      return null;
    }
    let id = isObject(_id) ? _id : this.buildId(_id);

    let parentMatch = this.m;
    let parentPath = this.path?.node ? this.path : this.path?.parent;
    let { name } = id;

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

    let { covers } = this.language;
    let isNode = this.matchIsNode;
    let isCover = this.matchIsCover;
    let isEmbedded = this.language !== this.m.parent?.resolvedLanguage;
    let { path, grammar } = this;

    if (!name) throw new Error('eval requires a type');

    if (parentPath?.node && this.atExpression && !attrs.noInterpolate && (isNode || isCover)) {
      let { quasisDone } = this;

      if (quasisDone) throw new Error('there must be more quasis than expressions');

      let result = this.expression;

      this.expressionIdx++;
      this.quasiIdx++;
      this.idx = 0;

      if (!parentPath?.node || isNode || covers.has(name)) {
        let path = this.m.attrs.path || '_:';

        if (isArray(result)) {
          for (let value of result) {
            parentPath.node = Path.from(parentPath.node).advance(path).advance(value).node;
          }
        } else {
          parentPath.node = Path.from(parentPath.node)
            .advance(path)
            .advance(result ? result : buildNullTag()).node;
        }
      }
    } else {
      if (isEmbedded) {
        this.spans.push({ type: 'Bare', guard: null });
      }

      if (!getProduction(grammar, name)) {
        throw new Error(`Unknown production {type: ${name}}`);
      }

      // if (isNode) {
      //   let { node } = this.path;
      //   this.path.node = Path.from(node).advance(buildOpenNodeTag(nodeFlags, node.type)).node;
      // }

      let result = getPrototypeOf(grammar)[name].call(grammar, this, props);

      if (isEmbedded) {
        this.spans.pop();
      }

      if (isNode || !parentPath) {
        if (result?.attrs) {
          this.path.node = Path.from(this.node).replaceWith(
            buildNode(
              Tags.replaceAt(
                0,
                buildFullOpenNodeTag(
                  nodeFlags,
                  isCover ? '_' : null,
                  this.path.name,
                  null,
                  deepFreezeRecord(result.attrs),
                ),
                this.path.node.value.tags,
              ),
            ),
          ).node;
        }

        this.path.node = Path.from(this.node).advance(buildCloseNodeTag()).node;

        if (parentPath?.node && !covers.has(name)) {
          let path = this.m.attrs.path
            ? this.m.attrs.path
            : parentPath.node.value.type === Symbol.for('_')
            ? '_:'
            : '.:';

          parentPath.node = Path.from(parentPath.node)
            .advance(shift_ == null ? path : '^^^')
            .advance(this.node).node;
        }
      }

      if (result?.shift) {
        this.shiftProduction(result.shift);
      }
    }

    let finishedMatch = this.m;
    this.m = this.m.parent;

    return finishedMatch.path.node;
  }

  updateSpans(attrs) {
    let { startSpan, endSpan, balanced, balancer } = attrs;
    if (endSpan || balancer) {
      if (!this.span.guard) {
        throw new Error('Only balanced spans can be closed with endSpan');
      }
      this.popSpan();
    }
    if (startSpan || balanced) {
      let type = startSpan || this.span.type;
      this.pushSpan({ type, guard: balanced });
    }
  }

  buildId(id) {
    let name;
    let language = this.language.name;

    let cnIdx = id.indexOf(':');
    if (cnIdx >= 0) {
      language = id.slice(0, cnIdx);
      name = id.slice(cnIdx + 1);
      if (name.includes(':')) throw new Error();
    } else {
      name = id;
    }

    return {
      name,
      language,
    };
  }

  eatHeldProduction(name, attrs) {
    if (!this.held) {
      throw new Error();
    }

    let { held, node } = this;

    this.held = null;

    let { path } = attrs;

    this.path.node = Path.from(node).advance(path).advance(held).node;

    return held;
  }

  shiftProduction(id, attrs = {}, props = {}) {
    let { node } = this;
    // don't push a new path onto the stack

    // get the most recently produced node and detach it from its parent

    let ref = parseTag(Tags.getAt(-1, Tags.getTags(node)).value.tags[1][0]);

    if (!ref.value.flags.expression) throw new Error();

    if (ref.type !== ReferenceTag) {
      throw new Error();
    }

    this.held = get(buildPathSegment(ref.value.name, -1), node);

    let shifted = this.eatProduction(id, attrs, props, 1);

    // shift(node, ref, shifted);

    return shifted;
  }

  eat(pattern, name, attrs) {
    if (name && !isString(name)) throw new Error('bad name');
    if (!isObject(attrs) || !attrs.path) throw new Error('a node must have a path');

    let { path, ..._attrs } = attrs;

    let result = this.matchSticky(pattern, attrs, this);

    if (!result) this.fail();

    this.idx += result.length;

    this.updateSpans(attrs);

    let path_ = attrs.path;

    this.path.node = Path.from(this.node)
      .advance(path_)
      .advance(buildToken(name, result, deepFreezeRecord(_attrs))).node;

    return result;
  }

  // matchLiteral would be a better name
  match(pattern, attrs = {}) {
    return this.matchSticky(pattern, attrs, this);
  }

  eatMatch(pattern, name, attrs) {
    if (name && !isString(name)) throw new Error('bad name');
    if (!isObject(attrs) || !attrs.path) throw new Error('a node must have a path');

    let result = this.matchSticky(pattern, attrs, this);

    if (result) {
      this.updateSpans(attrs);

      this.idx += result.length;

      let { path, ..._attrs } = attrs;

      let path_ = path;

      this.path.node = Path.from(this.node)
        .advance(path_)
        .advance(buildToken(name, result, deepFreezeRecord(_attrs))).node;
    }
    return result;
  }

  eatTrivia(pattern) {
    let result = this.matchSticky(pattern, {}, this);

    if (!result) this.fail();

    this.idx += result.length;

    this.path.node = Path.from(this.node)
      .advance(buildReferenceTag('#'))
      .advance(buildToken('Space', result)).node;

    return result;
  }

  eatMatchTrivia(pattern) {
    let result = this.matchSticky(pattern, {}, this);

    if (result) {
      this.idx += result.length;

      this.path.node = Path.from(this.node)
        .advance(buildReferenceTag('#'))
        .advance(buildToken('Space', result)).node;
    }

    return result;
  }

  eatEscape(pattern) {
    let result = this.matchSticky(pattern, {}, this);

    if (!result) this.fail();

    this.idx += result.length;

    let raw = result;
    let cooked = this.language.cookEscape(result, this.span);
    let attributes = { cooked };

    this.path.node = Path.from(this.node)
      .advance(buildReferenceTag('@'))
      .advance(buildToken('Escape', raw, attributes)).node;

    return result;
  }

  eatLiteral(pattern) {
    let result = this.matchSticky(pattern, {}, this);

    if (!result) this.fail();

    this.idx += result.length;

    this.path.node = buildNode(Tags.push(buildLiteralTag(result), this.node.value.tags));

    return result;
  }

  eatMatchLiteral(pattern) {
    let result = this.matchSticky(pattern, {}, this);

    if (result) {
      this.idx += result.length;

      this.path.node = buildNode(Tags.push(buildLiteralTag(result), this.node.value.tags));
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
    throw new Error(`miniparser: parsing \`${this.guardedSlicedQuasi}\` failed`);
  }
}
