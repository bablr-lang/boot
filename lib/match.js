import { createNode } from '@bablr/agast-helpers/tree';
import { Path } from './path.js';
import { resolveDependentLanguage } from './utils.js';
import * as sym from '@bablr/agast-helpers/symbols';

export class Match {
  constructor(parent, resolvedLanguage, id, attributes, path) {
    this.parent = parent;
    this.resolvedLanguage = resolvedLanguage;
    this.id = id;
    this.attributes = attributes;
    this.path = path;

    this.grammar =
      parent?.resolvedLanguage === resolvedLanguage
        ? parent.grammar
        : new resolvedLanguage.grammar();
  }

  get isNode() {
    const { type, resolvedLanguage } = this;
    const { covers } = resolvedLanguage;

    return covers.get(sym.node).has(type) && !covers.has(type);
  }

  get language() {
    return this.id.language;
  }

  get type() {
    return this.id.type;
  }

  get attrs() {
    return this.attributes;
  }

  static from(language, id, attrs = {}) {
    const resolvedLanguage = resolveDependentLanguage(language, id.language);
    const { covers } = resolvedLanguage;
    const { type } = id;
    const isCover = covers.has(type);
    const isNode = covers.get(sym.node).has(type);

    if (!isNode && !isCover) {
      throw new Error(`Top {type: ${type}} must be a node or fragment`);
    }

    const path = Path.from(id, attrs);

    if (isNode && !isCover) {
      path.node = createNode();
      path.node.type = type;
      path.node.language = resolvedLanguage.canonicalURL;
    }

    return new Match(null, resolvedLanguage, id, attrs, path);
  }

  generate(id, attrs) {
    const resolvedLanguage = resolveDependentLanguage(this.resolvedLanguage, id.language);
    const { covers } = resolvedLanguage;
    const { type } = id;
    const isCover = covers.has(type);
    const isNode = covers.get(sym.node).has(type) && !isCover;

    const baseAttrs = this.isNode ? {} : this.attrs;

    let { path } = this;

    if (isNode) {
      if (!path.node) {
        const relativeType = id.language === this.language ? id.type : `${id.language}:${id.type}`;
        if (!this.resolvedLanguage.covers.get(path.type).has(relativeType)) throw new Error();
      } else {
        path = path.generate(id, attrs);
      }
      path.node = createNode();
      path.node.type = Symbol.for(type);
      path.node.language = resolvedLanguage.canonicalURL;
    }

    return new Match(this, resolvedLanguage, id, { ...baseAttrs, ...attrs }, path);
  }
}
