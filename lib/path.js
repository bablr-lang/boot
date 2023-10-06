const { Resolver } = require('./resolver.js');
const { stripPathBraces } = require('./utils.js');

class Path {
  constructor(type, attrs, parent = null) {
    this.type = type;
    this.attrs = attrs;
    this.parent = parent;

    this.children = [];
    this.properties = {};
    this.resolver = new Resolver();
  }

  generate(gap) {
    const { attrs, type } = gap;
    if (attrs.path?.trim().startsWith('[')) {
      this.resolver.eat(stripPathBraces(attrs.path));
    }
    return new Path(type, attrs, this);
  }

  static from(gap) {
    const { attrs, type } = gap;
    return new Path(type, attrs);
  }
}

module.exports = { Path };
