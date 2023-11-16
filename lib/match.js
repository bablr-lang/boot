const { Path, buildNode } = require('./path.js');
const { resolveDependentLanguage } = require('./utils.js');
const sym = require('./symbols.js');

class Match {
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
    const isFragment = covers.get(sym.fragment)?.has(type);

    if (!isNode && !isFragment) {
      throw new Error(`Top {type: ${type}} must be a node or fragment`);
    }

    const path = Path.from(id, attrs);

    if (isFragment || (isNode && !isCover)) {
      path.node = buildNode(id);
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
      path.node = buildNode(id);
    }

    return new Match(this, resolvedLanguage, id, { ...baseAttrs, ...attrs }, path);
  }
}

module.exports = { Match };
