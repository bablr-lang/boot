const emptyStack = require('@iter-tools/imm-stack');
const sym = require('@bablr/boot-helpers/symbols');
const {
  DoctypeTag,
  OpenNodeTag,
  CloseNodeTag,
  ReferenceTag,
  GapTag,
  NullTag,
  ArrayTag,
  LiteralTag,
  EmbeddedNode,
} = require('@bablr/boot-helpers/symbols');
const btree = require('@bablr/boot-helpers/btree');

const { isInteger, isFinite } = Number;
const { isArray } = Array;
const isString = (val) => typeof val === 'string';
const isNumber = (val) => typeof val === 'number';

const { freeze, hasOwn } = Object;

const get = (node, path) => {
  const { type, properties } = node;
  const { 1: name, 2: index } = /^([^\.]+)(?:\.(\d+))?/.exec(path) || [];

  if (!hasOwn(properties, name)) {
    throw new Error(`Cannot find {name: ${name}} on node of {type: ${type}}`);
  }

  if (index != null) {
    return btree.getAt(parseInt(index, 10), properties[name]);
  } else {
    return properties[name];
  }
};

class Resolver {
  constructor(
    states = emptyStack.push({ properties: new Map(), idx: 0 }),
    reference = null,
    popped = false,
  ) {
    this.states = states;
    this.reference = reference;
    this.popped = popped;
  }

  get idx() {
    return this.states.value.idx;
  }

  get properties() {
    return this.states.value.properties;
  }

  advance(tag) {
    const { states } = this;

    ++states.value.idx;

    this.popped = false;

    switch (tag.type) {
      case ReferenceTag: {
        const { name, isArray } = tag.value;
        const { properties } = states.value;

        this.reference = tag;

        let state = properties.get(name);

        if (isArray) {
          if (state && !state.isArray) throw new Error();

          const { count = -1 } = state || {};

          state = { count: count + 1, isArray };
        } else if (state) {
          throw new Error(`attempted to consume property {name: ${name}} twice`);
        } else {
          state = { count: 1, isArray: false };
        }

        properties.set(name, state);

        if (!isArray || state.count > 0) {
          this.states = states.push({ properties: new Map(), idx: 0 });
        }

        break;
      }

      case EmbeddedNode: {
        this.reference = tag;

        this.states = states.push({ properties: new Map(), idx: 0 });
        break;
      }

      case OpenNodeTag: {
        const { flags } = tag.value;
        const isRootNode = states.size === 1;

        if (!isRootNode && !this.reference && !(flags.trivia || flags.escape)) {
          throw new Error();
        }

        if (this.reference?.type !== EmbeddedNode && (flags.trivia || flags.escape)) {
          this.states = states.push({ properties: new Map(), idx: 0 });
        }

        this.reference = null;
        break;
      }

      case ArrayTag: {
        if (!this.reference) throw new Error();

        const { name } = this.reference.value;
        const { properties } = states.value;
        const state = properties.get(name);

        if (!state || !state.isArray || state.count !== 0) throw new Error();

        properties.set(name, { count: 0, isArray: true });

        this.reference = null;
        break;
      }

      case NullTag:
      case GapTag: {
        this.states = states.pop();
        this.popped = true;
        this.reference = null;
        break;
      }

      case CloseNodeTag: {
        this.states = states.pop();
        this.popped = true;
      }
    }

    return this;
  }

  resolve(reference) {
    let { name, isArray } = reference.value;
    const { states } = this;
    const state = states.value.properties.get(name);
    let path = name;

    if (isArray) {
      const count = state?.count || 0;
      path += '.' + count;
    }

    return path;
  }
}

function* streamFromTree(rootNode) {
  if (!rootNode || rootNode.type === GapTag) {
    return rootNode;
  }

  let stack = emptyStack.push(rootNode);
  const resolver = new Resolver();

  stack: while (stack.size) {
    const node = stack.value;
    const { children } = node;

    while (true) {
      const tag = btree.getAt(resolver.idx, children);

      switch (tag.type) {
        case EmbeddedNode: {
          stack = stack.push(tag.value);

          resolver.advance(tag);

          continue stack;
        }

        case ReferenceTag: {
          const resolvedPath = resolver.resolve(tag);
          const resolved = get(stack.value, resolvedPath);
          const { name, isArray: refIsArray } = tag.value;

          if (!resolved) throw new Error();

          yield tag;

          resolver.advance(tag);

          const resolverState = resolver.properties.get(name);

          const isEmptyArray = resolverState?.count === 0;

          if (!refIsArray || !isEmptyArray) {
            if (isArray(resolved)) throw new Error();
            stack = stack.push(resolved);
          }
          continue stack;
        }

        case GapTag:
        case NullTag:
        case CloseNodeTag: {
          stack = stack.pop();
          resolver.advance(tag);
          yield tag;
          continue stack;
        }

        default:
          resolver.advance(tag);
          yield tag;
          break;
      }
    }
  }
}

const printExpression = (expr) => {
  if (isString(expr)) {
    return printString(expr);
  } else if (expr == null || typeof expr === 'boolean') {
    return String(expr);
  } else if (isNumber(expr)) {
    if (!isInteger(expr) && isFinite(expr)) {
      throw new Error();
    }
    return String(expr);
  } else if (isArray(expr)) {
    return `[${expr.map((v) => printExpression(v)).join(', ')}]`;
  } else if (typeof expr === 'object') {
    return `{${Object.entries(expr).map(([k, v]) => `${k}: ${printExpression(v)}`)}}`;
  } else {
    throw new Error();
  }
};

const printLanguage = (language) => {
  if (isString(language)) {
    return printSingleString(language);
  } else {
    return language.join('.');
  }
};

const printTagPath = (language, type) => {
  return language?.length ? `${printLanguage(language)}:${type}` : type;
};

const printAttributes = (attributes) => {
  return Object.entries(attributes)
    .map(([k, v]) => (v === true ? k : `${k}=${printExpression(v)}`))
    .join(' ');
};

const printFlags = (flags) => {
  const hash = flags.trivia ? '#' : '';
  const star = flags.token ? '*' : '';
  const at = flags.escape ? '@' : '';

  if (flags.escape && flags.trivia) throw new Error('Node cannot be escape and trivia');

  return `${hash}${star}${at}`;
};

const printTag = (tag) => {
  switch (tag?.type || NullTag) {
    case NullTag: {
      return 'null';
    }

    case GapTag: {
      return `<//>`;
    }

    case ArrayTag: {
      return `[]`;
    }

    case LiteralTag: {
      return printString(tag.value);
    }

    case DoctypeTag: {
      let { doctype, attributes } = tag.value;

      attributes = attributes ? ` ${printAttributes(attributes)}` : '';

      return `<!${doctype}${attributes}>`;
    }

    case ReferenceTag: {
      const { name, isArray } = tag.value;
      const pathBraces = isArray ? '[]' : '';

      return `${name}${pathBraces}:`;
    }

    case OpenNodeTag: {
      const { flags, language: tagLanguage, type, attributes } = tag.value;
      const printedAttributes = attributes && printAttributes(attributes);
      const attributesFrag = printedAttributes ? ` ${printedAttributes}` : '';

      if (type === sym.gap) {
        return '';
      }

      if (flags.escape && flags.trivia) throw new Error('Node cannot be escape and trivia');

      return `<${printFlags(flags)}${printTagPath(tagLanguage, type)}${attributesFrag}>`;
    }

    case CloseNodeTag: {
      return `</>`;
    }

    default:
      throw new Error(`Unexpected tag {type: ${tag?.type}}`);
  }
};

const printPrettyCSTML = (tree, indent = '  ') => {
  const tags = streamFromTree(tree);

  if (!tags) {
    return '<//>';
  }

  let printed = '';
  let indentLevel = 0;
  let first = true;

  for (const tag of tags) {
    if (!first && tag.type !== NullTag) {
      printed += '\n';
    }

    if (tag.type === CloseNodeTag) {
      indentLevel--;
    }

    if (tag.type !== NullTag) {
      printed += indent.repeat(indentLevel);
    } else {
      printed += ' ';
    }
    printed += printTag(tag);

    if (tag.type === OpenNodeTag) {
      indentLevel++;
    }

    first = false;
  }

  return printed;
};

const escapeReplacer = (esc) => {
  if (esc === '\r') {
    return '\\r';
  } else if (esc === '\n') {
    return '\\n';
  } else if (esc === '\0') {
    return '\\0';
  } else {
    return `\\${esc}`;
  }
};

const printSingleString = (str) => {
  return `'${str.replace(/['\\\0\r\n]/g, escapeReplacer)}'`;
};

const printDoubleString = (str) => {
  return `"${str.replace(/["\\\0\r\n]/g, escapeReplacer)}"`;
};

const printString = (str) => {
  return str === "'" ? printDoubleString(str) : printSingleString(str);
};

module.exports = {
  Resolver,
  printExpression,
  printAttributes,
  printTag,
  printPrettyCSTML,
  printSingleString,
  printDoubleString,
  printString,
};
