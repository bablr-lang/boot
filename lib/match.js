const { Path } = require('./path.js');
const { resolveDependentLanguage } = require('./utils.js');
const sym = require('./symbols.js');

class Match {
  constructor(parent, language, path) {
    this.parent = parent;
    this.language = language;
    this.path = path;

    this.grammar = parent?.language === language ? parent.grammar : new language.grammar();
  }

  static from(language, id) {
    return new Match(null, language, Path.from(id));
  }

  generate(id, attrs) {
    const language = resolveDependentLanguage(this.language, id.language);
    const { covers } = language;
    const { type } = id;
    const isNode = covers.get(sym.node).has(type) && !covers.has(type);
    return new Match(this, language, isNode ? this.path.generate(id, attrs) : this.path);
  }
}

module.exports = { Match };
