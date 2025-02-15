import { buildReferenceTag } from '@bablr/agast-helpers/tree';

const { hasOwn, freeze } = Object;
const { isArray } = Array;

export const parsePath = (str) => {
  const match = /^([a-zA-Z]+)(\[\])?(\+)?(\$)?$/.exec(str);

  if (!match) throw new Error();

  let flags = freeze({ expression: !!match[3], hasGap: !!match[4] });

  return buildReferenceTag(match[1], !!match[2], flags);
};

export class Path {
  constructor(id, attributes, parent = null) {
    this.id = id;
    this.attributes = attributes;
    this.parent = parent;

    this.node = null;
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
    return new Path(id, attrs, this);
  }

  static from(id, attrs = {}) {
    return new Path(id, attrs);
  }
}

export class PathResolver {
  constructor(node) {
    this.node = node;
    this.counters = {};
  }

  get(path) {
    const { node, counters } = this;

    const { isArray: pathIsArray, name } = path;

    if (!hasOwn(node.properties, name)) {
      throw new Error(`cannot resolve {path: ${name}}`);
    }

    let value = node.properties[name];

    if (pathIsArray) {
      if (!isArray(value)) {
        throw new Error(`cannot resolve {path: ${name}}: not an array`);
      }

      const counter = counters[name] ?? 0;

      counters[name] = counter + 1;

      value = value[counter];
    }

    return value;
  }
}
