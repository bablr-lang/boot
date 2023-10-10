const { Resolver } = require('./resolver.js');
const { stripPathBraces } = require('./utils.js');

class Node {
  constructor(type) {
    this.language = type.language;
    this.production = type.production;
    this.attrs = {};
    this.children = [];
    this.properties = {};
  }
}

class Path {
  constructor(gap, node, parent = null) {
    this.gap = gap;
    this.node = node;
    this.parent = parent;

    this.resolver = new Resolver();
  }

  get parentProperty() {
    return this.attrs.path;
  }

  get type() {
    return this.gap.type;
  }

  get attrs() {
    return this.gap.attrs;
  }

  generate(gap) {
    const { attrs, type } = gap;
    if (attrs.path?.startsWith('[')) {
      this.resolver.eat(stripPathBraces(attrs.path));
    }
    return new Path(gap, new Node(type), this);
  }

  static from(gap) {
    return new Path(gap, new Node(gap.type));
  }
}

module.exports = { Path, Node };
