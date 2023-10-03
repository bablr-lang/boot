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

  static from(language, gap) {
    return new Match(null, language, new Path(gap));
  }

  generate(gap) {
    const language = resolveDependentLanguage(this.language, gap.tagName.language);
    const { covers } = language;
    const { type } = gap.tagName;
    const isNode = covers.get(sym.node).has(type) && !covers.has(type);
    return new Match(this, language, isNode ? this.path.generate(gap) : this.path);
  }
}

module.exports = { Match };
