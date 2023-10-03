const { Resolver } = require('./resolver.js');
const { stripPathBraces } = require('./utils.js');

class Path {
  constructor(tagName, attrs, parent = null) {
    this.tagName = tagName;
    this.attrs = attrs;
    this.parent = parent;

    this.children = [];
    this.properties = {};
    this.resolver = new Resolver();
  }

  generate(gap) {
    const { attrs, tagName } = gap;
    if (attrs.path?.trim().startsWith('[')) {
      this.resolver.eat(stripPathBraces(attrs.path));
    }
    return new Path(tagName, attrs, this);
  }

  static from(gap) {
    const { attrs, tagName } = gap;
    return new Path(tagName, attrs);
  }
}

module.exports = { Path };
