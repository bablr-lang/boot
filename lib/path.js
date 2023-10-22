const { Resolver } = require('./resolver.js');
const { stripPathBraces } = require('./utils.js');

class Node {
  constructor(language, type) {
    this.language = language;
    this.type = type;
    this.attributes = {};
    this.children = [];
    this.properties = {};
  }

  static from(id) {
    const { language, type } = id;
    return new Node(language, type);
  }
}

class Path {
  constructor(id, attributes, parent = null) {
    this.id = id;
    this.attributes = attributes;
    this.parent = parent;

    this.node = null;

    this.resolver = new Resolver();
  }

  get parentProperty() {
    return this.attributes.path;
  }

  get attrs() {
    return this.attributes;
  }

  get language() {
    return this.id.language;
  }

  get type() {
    return this.id.type;
  }

  generate(id, attrs) {
    if (attrs.path?.startsWith('[')) {
      this.resolver.eat(stripPathBraces(attrs.path));
    }
    return new Path(id, attrs, this);
  }

  static from(id, attrs = {}) {
    return new Path(id, attrs);
  }
}

module.exports = { Path, Node };
