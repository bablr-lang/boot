const buildNode = (id) => {
  const { language, type } = id;

  return {
    language,
    type,
    attributes: {},
    children: [],
    properties: {},
  };
};

const stripPathBraces = (str) => (str.endsWith('[]') ? str.slice(0, -2) : str);

const parsePath = (str) => {
  const pathName = stripPathBraces(str);

  if (!/^\w+$/.test(pathName)) throw new Error();

  return { pathIsArray: pathName !== str, pathName };
};

class Path {
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

module.exports = { Path, buildNode, parsePath };
