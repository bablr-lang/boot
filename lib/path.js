const { Resolver } = require('./resolver.js');
const { stripPathBraces } = require('./utils.js');

class Node {
  constructor(id) {
    this.language = id.language;
    this.type = id.type;
    this.attributes = {};
    this.children = [];
    this.properties = {};
  }
}

class Path {
  constructor(id, attributes, node, parent = null) {
    this.id = id;
    this.attributes = attributes;
    this.node = node;
    this.parent = parent;

    this.resolver = new Resolver();
  }

  get parentProperty() {
    return this.attributes.path;
  }

  get attrs() {
    return this.attributes;
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
    return new Path(id, attrs, new Node(id), this);
  }

  static from(id, attrs = {}) {
    return new Path(id, attrs, new Node(id));
  }
}

module.exports = { Path, Node };
