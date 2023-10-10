const { Resolver } = require('./resolver.js');
const { stripPathBraces } = require('./utils.js');

class Node {
  constructor(id) {
    this.language = id.language;
    this.type = id.type;
    this.attrs = {};
    this.children = [];
    this.properties = {};
  }
}

class Path {
  constructor(id, attrs, node, parent = null) {
    this.id = id;
    this.attrs = attrs;
    this.node = node;
    this.parent = parent;

    this.resolver = new Resolver();
  }

  get parentProperty() {
    return this.attrs.path;
  }

  get langauge() {
    return this.id.langauge;
  }

  get type() {
    return this.id.type;
  }

  generate(id, attrs) {
    const { type } = id;
    if (attrs.path?.startsWith('[')) {
      this.resolver.eat(stripPathBraces(attrs.path));
    }
    return new Path(id, attrs, new Node(type), this);
  }

  static from(id, attrs = {}) {
    return new Path(id, attrs, new Node(id.type));
  }
}

module.exports = { Path, Node };
