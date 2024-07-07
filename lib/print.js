const emptyStack = require('@iter-tools/imm-stack');

const { isInteger, isFinite } = Number;
const { isArray } = Array;
const isString = (val) => typeof val === 'string';
const isNumber = (val) => typeof val === 'number';

const { freeze } = Object;

const get = (node, path) => {
  const { 1: name, 2: index } = /^([^\.]+)(?:\.(\d+))?/.exec(path) || [];

  if (index != null) {
    return node.properties[name]?.[parseInt(index, 10)];
  } else {
    return node.properties[name];
  }
};

class Resolver {
  constructor(node, counters = new Map()) {
    this.node = node;
    this.counters = counters;
  }

  consume(reference) {
    const { name, isArray } = reference.value;
    const { counters } = this;

    if (isArray) {
      const count = counters.get(name) + 1 || 0;

      counters.set(name, count);
    } else {
      if (counters.has(name)) throw new Error('attempted to consume property twice');

      counters.set(name, 1);
    }

    return this;
  }

  resolve(reference) {
    let { name, isArray } = reference.value;
    const { counters } = this;
    let path = name;

    if (isArray) {
      const count = counters.get(name) || 0;

      path += '.' + count;
    }

    return path;
  }

  get(reference) {
    if (!this.node) throw new Error('Cannot get from a resolver with no node');

    return get(this.node, this.resolve(reference));
  }

  branch() {
    return new Resolver(this.node, new Map(this.counters));
  }

  accept(resolver) {
    this.counters = resolver.counters;

    return this;
  }
}

const buildFrame = (node) => {
  if (!node) throw new Error();
  return { node, childrenIdx: -1, resolver: new Resolver(node) };
};

const buildNull = () => {
  return freeze({ type: 'Null', value: undefined });
};

const buildDoctypeTag = () => {
  return freeze({ type: 'DoctypeTag', value: { doctype: 'cstml', version: 0 } });
};

const buildNodeOpenTag = (flags = {}, language = null, type = null, attributes = {}) => {
  let { token, trivia, escape } = flags;

  token = !!token;
  trivia = !!trivia;
  escape = !!escape;

  return freeze({
    type: 'OpenNodeTag',
    value: freeze({ flags: freeze({ token, trivia, escape }), language, type, attributes }),
  });
};

const buildNodeCloseTag = (type = null, language = null) => {
  return freeze({ type: 'CloseNodeTag', value: freeze({ language, type }) });
};

function* streamFromTree(rootNode) {
  if (!rootNode || rootNode.type === 'Gap') {
    return rootNode;
  }

  yield buildDoctypeTag();
  yield buildNodeOpenTag(undefined, rootNode.language[0]);

  let stack = emptyStack.push(buildFrame(rootNode));

  stack: while (stack.size) {
    const frame = stack.value;
    const { node, resolver } = frame;
    const { language, type, attributes, flags } = node;

    if (frame.childrenIdx === -1 && stack.size > 1) {
      yield buildNodeOpenTag(flags, language, type, attributes);
    }

    while (++frame.childrenIdx < node.children.length) {
      const terminal = node.children[frame.childrenIdx];

      switch (terminal.type) {
        case 'Literal':
        case 'Gap':
        case 'Null': {
          yield terminal;
          break;
        }

        case 'Embedded': {
          stack = stack.push(buildFrame(terminal.value));
          continue stack;
        }

        case 'Reference': {
          if (stack.size > 1) {
            yield terminal;
          }

          const resolved = resolver.consume(terminal).get(terminal);
          if (resolved) {
            stack = stack.push(buildFrame(resolved));
            continue stack;
          } else {
            yield buildNull();
            break;
          }
        }

        default: {
          throw new Error();
        }
      }
    }

    if (stack.size > 1) {
      yield buildNodeCloseTag(node.type, node.language);
    }

    stack = stack.pop();
  }
  yield buildNodeCloseTag();
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

const printTerminal = (terminal) => {
  switch (terminal?.type || 'Null') {
    case 'Null': {
      return 'null';
    }

    case 'Gap': {
      return `<//>`;
    }

    case 'Literal': {
      return printString(terminal.value);
    }

    case 'DoctypeTag': {
      let { doctype, attributes } = terminal.value;

      attributes = attributes ? ` ${printAttributes(attributes)}` : '';

      return `<!${doctype}${attributes}>`;
    }

    case 'Reference': {
      const { name, isArray } = terminal.value;
      const pathBraces = isArray ? '[]' : '';

      return `${name}${pathBraces}:`;
    }

    case 'OpenNodeTag': {
      const { flags, language: tagLanguage, type, attributes } = terminal.value;
      const printedAttributes = attributes && printAttributes(attributes);
      const attributesFrag = printedAttributes ? ` ${printedAttributes}` : '';

      if (flags.escape && flags.trivia) throw new Error('Node cannot be escape and trivia');

      return `<${printFlags(flags)}${printTagPath(tagLanguage, type)}${attributesFrag}>`;
    }

    case 'CloseNodeTag': {
      return `</>`;
    }

    default:
      throw new Error();
  }
};

const printPrettyCSTML = (tree, indent = '  ') => {
  const terminals = streamFromTree(tree);

  if (!terminals) {
    return '<//>';
  }

  let printed = '';
  let indentLevel = 0;
  let first = true;

  for (const terminal of terminals) {
    if (!first && terminal.type !== 'Null') {
      printed += '\n';
    }

    if (terminal.type === 'CloseNodeTag') {
      indentLevel--;
    }

    if (terminal.type !== 'Null') {
      printed += indent.repeat(indentLevel);
    } else {
      printed += ' ';
    }
    printed += printTerminal(terminal);

    if (terminal.type === 'OpenNodeTag') {
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
  printExpression,
  printAttributes,
  printTerminal,
  printPrettyCSTML,
  printSingleString,
  printDoubleString,
  printString,
};
