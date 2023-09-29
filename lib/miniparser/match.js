const { Path } = require('./path.js');

class Match {
  constructor(parent, language, type, path) {
    this.parent = parent;
    this.language = language;
    this.type = type;
    this.path = path;

    this.grammar = parent?.language === language ? parent.grammar : new language.grammar();
  }

  static from(language, type) {
    return new Match(null, language, type, new Path());
  }

  generate(language, type, path = this.path) {
    return new Match(this, language, type, path);
  }
}

module.exports = { Match };
