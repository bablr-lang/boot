const { Path } = require('./path.js');
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
    return new Match(null, language, id, attrs, Path.from(id, attrs));
  }

  generate(id, attrs) {
    const resolvedLanguage = resolveDependentLanguage(this.resolvedLanguage, id.language);
    const { covers } = resolvedLanguage;
    const { type } = id;
    const isNode = covers.get(sym.node).has(type) && !covers.has(type);

    return new Match(
      this,
      resolvedLanguage,
      id,
      attrs,
      isNode ? this.path.generate(id, attrs) : this.path,
    );
  }
}

module.exports = { Match };
