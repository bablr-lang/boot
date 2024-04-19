const emptyStack = require('@iter-tools/imm-stack');

const { isInteger, isFinite } = Number;
const { isArray } = Array;
const isString = (val) => typeof val === 'string';
const isNumber = (val) => typeof val === 'number';

const { freeze } = Object;

const get = (node, path) => {
  const { 1: pathName, 2: index } = /^([^\.]+)(?:\.(\d+))?/.exec(path) || [];

  if (index != null) {
    return node.properties[pathName]?.[parseInt(index, 10)];
  } else {
    return node.properties[pathName];
  }
};

class Resolver {
  constructor(node, counters = new Map()) {
    this.node = node;
    this.counters = counters;
  }

  consume(reference) {
    const { pathName, pathIsArray } = reference.value;
    const { counters } = this;

    if (pathIsArray) {
      const count = counters.get(pathName) + 1 || 0;

      counters.set(pathName, count);
    } else {
      if (counters.has(pathName)) throw new Error('attempted to consume property twice');

      counters.set(pathName, 1);
    }

    return this;
  }

  resolve(reference) {
    let { pathName, pathIsArray } = reference.value;
    const { counters } = this;
    let path = pathName;

    if (pathIsArray) {
      const count = counters.get(pathName) || 0;

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

const buildDoctypeTag = (language) => {
  return freeze({ type: 'DoctypeTag', value: { doctype: 'cstml', language } });
};

const buildNodeOpenTag = (flags, language, type, attributes = {}) => {
  let { token, trivia, escape } = flags;

  token = !!token;
  trivia = !!trivia;
  escape = !!escape;

  return freeze({
    type: 'OpenNodeTag',
    value: freeze({ flags: freeze({ token, trivia, escape }), language, type, attributes }),
  });
};

const fragmentFlags = freeze({ escape: false, trivia: false });

const buildFragmentOpenTag = (flags = fragmentFlags) => {
  let { trivia, escape } = flags;

  trivia = !!trivia;
  escape = !!escape;

  return freeze({ type: 'OpenFragmentTag', value: freeze({ flags: freeze({ trivia, escape }) }) });
};

const buildNodeCloseTag = (type = null, language = null) => {
  return freeze({ type: 'CloseNodeTag', value: freeze({ language, type }) });
};

const buildFragmentCloseTag = () => {
  return freeze({ type: 'CloseFragmentTag', value: freeze({}) });
};

function* streamFromTree(rootNode) {
  if (!rootNode || rootNode.type === 'Gap') {
    return rootNode;
  }

  yield buildDoctypeTag(rootNode.language[0]);
  yield buildFragmentOpenTag();

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
  yield buildFragmentCloseTag();
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
      let { doctype, language, attributes } = terminal.value;

      language = printString(language);
      attributes = attributes ? ` ${printAttributes(attributes)}` : '';

      return `<!${doctype} ${language}${attributes}>`;
    }

    case 'Reference': {
      const { pathName, pathIsArray } = terminal.value;
      const pathBraces = pathIsArray ? '[]' : '';

      return `${pathName}${pathBraces}:`;
    }

    case 'OpenNodeTag': {
      const { flags, language: tagLanguage, type, attributes } = terminal.value;
      const printedAttributes = attributes && printAttributes(attributes);
      const attributesFrag = printedAttributes ? ` ${printedAttributes}` : '';
      const star = flags.token ? '*' : '';
      const hash = flags.trivia ? '#' : '';
      const at = flags.escape ? '@' : '';

      if (flags.escape && flags.trivia) throw new Error('Node cannot be escape and trivia');

      return `<${star}${hash}${at}${printTagPath(tagLanguage, type)}${attributesFrag}>`;
    }

    case 'OpenFragmentTag': {
      const { flags } = terminal.value;
      const hash = flags.trivia ? '#' : '';
      return `<${hash}>`;
    }

    case 'CloseNodeTag':
    case 'CloseFragmentTag': {
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

    if (['CloseNodeTag', 'CloseFragmentTag'].includes(terminal.type)) {
      indentLevel--;
    }

    if (terminal.type !== 'Null') {
      printed += indent.repeat(indentLevel);
    } else {
      printed += ' ';
    }
    printed += printTerminal(terminal);

    if (['OpenFragmentTag', 'OpenNodeTag'].includes(terminal.type)) {
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
