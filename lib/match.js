import { Path } from './path.js';
import { resolveDependentLanguage } from './utils.js';
import * as sym from '@bablr/agast-vm-helpers/symbols';
import { buildOpenCoverTag, buildOpenNodeTag, nodeFlags } from '@bablr/agast-helpers/builders';
import { buildNode } from '@bablr/agast-helpers/path';

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
    const { name, resolvedLanguage } = this;
    const { covers } = resolvedLanguage;

    return covers.get(Symbol.for('@bablr/node')).has(name) && !covers.has(name);
  }

  get language() {
    return this.id.language;
  }

  get type() {
    return this.id.type;
  }

  get name() {
    return this.id.name;
  }

  get attrs() {
    return this.attributes;
  }

  static from(language, id, attrs = {}) {
    const resolvedLanguage = resolveDependentLanguage(language, id.language);
    const { covers } = resolvedLanguage;
    const { name } = id;
    const isCover = covers.has(name);
    const isNode = covers.get(Symbol.for('@bablr/node')).has(name);

    if (!isNode && !isCover) {
      throw new Error(`Top {type: ${name}} must be a node or fragment`);
    }

    const path = Path.from(id, attrs);

    path.node = buildNode(
      isCover ? buildOpenCoverTag(nodeFlags, name) : buildOpenNodeTag(nodeFlags, name),
    );

    return new Match(null, resolvedLanguage, id, attrs, path);
  }

  generate(id, attrs) {
    const resolvedLanguage = resolveDependentLanguage(this.resolvedLanguage, id.language);
    const { covers } = resolvedLanguage;
    const { name } = id;
    const isCover = covers.has(name);
    const isNode = covers.get(Symbol.for('@bablr/node')).has(name) && !isCover;

    const baseAttrs = this.isNode ? {} : this.attrs;

    let { path } = this;

    if (isNode) {
      if (!path.node) {
        const relativeType = id.language === this.language ? id.type : `${id.language}:${id.type}`;
        if (!this.resolvedLanguage.covers.get(path.type).has(relativeType)) throw new Error();
      } else {
        path = path.generate(id, attrs);
      }
      path.node = buildNode(buildOpenNodeTag(nodeFlags, name));
    }

    return new Match(this, resolvedLanguage, id, { ...baseAttrs, ...attrs }, path);
  }
}
