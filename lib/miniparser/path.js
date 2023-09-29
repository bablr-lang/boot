const { Resolver } = require('./resolver.js');

class Path {
  constructor(parent = null, parentProperty = null) {
    this.parent = parent;
    this.parentProperty = parentProperty;
    this.children = [];
    this.properties = {};
    this.resolver = new Resolver();
  }

  generate(property) {
    this.resolver.eat(property);
    return new Path(this, property);
  }
}

module.exports = { Path };
