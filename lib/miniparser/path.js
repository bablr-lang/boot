const { Resolver } = require('./resolver.js');

class Path {
  constructor(type, attrs, parent = null, parentProperty = null) {
    this.type = type;
    this.attrs = attrs;
    this.parent = parent;
    this.parentProperty = parentProperty;
    this.children = [];
    this.properties = {};
    this.resolver = new Resolver();
  }

  generate(type, property, attrs) {
    this.resolver.eat(property);
    return new Path(type, attrs, this, property);
  }
}

module.exports = { Path };
