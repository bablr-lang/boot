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
    return new Match(null, language, Path.from(gap));
  }

  generate(gap) {
    const language = resolveDependentLanguage(this.language, gap.type.language);
    const { covers } = language;
    const { production } = gap.type;
    const isNode = covers.get(sym.node).has(production) && !covers.has(production);
    return new Match(this, language, isNode ? this.path.generate(gap) : this.path);
  }
}

module.exports = { Match };
