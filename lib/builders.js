const { freeze, getPrototypeOf } = Object;
const { isArray } = Array;

const spreads = new WeakMap();

const spread = (arg) => {
  const wrapper = { value: arg };
  spreads.set(wrapper, true);
  return wrapper;
};

const interpolateArray = (values, buildSeparator) => {
  const children = [];
  for (const value of values) {
    if (spreads.has(value)) {
      let first = true;

      for (const element of value.value) {
        if (!first && buildSeparator) {
          children.push(buildSeparator());
        }

        children.push(element);

        first = false;
      }
    } else {
      children.push(value);
    }
  }
  return children;
};

const buildTerminal = (term) => {
  switch (term?.type) {
    case 'Literal':
      return term;

    // case 'Escape':
    //   return buildEscapeNode;

    default:
      throw new Error('Invalid terminal of type ' + term.type);
  }
};

const interpolateString = (value) => {
  const children = [];
  if (isArray(value)) {
    for (const element of value) {
      children.push(buildTerminal(element));
    }
  } else {
    // we can't safely interpolate strings here, though I wish we could
    children.push(buildTerminal(value));
  }

  return buildNode('String', 'Content', children);
};

const buildReference = (name, isArray) => {
  return freeze({ type: 'Reference', value: freeze({ name, isArray }) });
};

const buildGap = () => {
  return freeze({ type: 'Gap', value: undefined });
};

const buildNodeOpenTag = (flags, type, attributes = {}) => {
  return freeze({ type: 'OpenNodeTag', value: freeze({ flags, type, attributes }) });
};

const buildFragmentOpenTag = (flags = {}, language) => {
  return freeze({ type: 'OpenFragmentTag', value: freeze({ flags: freeze(flags), language }) });
};

const buildNodeCloseTag = (type) => {
  return freeze({ type: 'CloseNodeTag', value: freeze({ type }) });
};

const buildFragmentCloseTag = () => {
  return freeze({ type: 'CloseFragmentTag', value: freeze({}) });
};

const buildLiteral = (value) => {
  return freeze({ type: 'Literal', value });
};

const buildProperty = (key, value) => {
  return node('Instruction', 'Property', [ref`key`, ref`mapOperator`, buildSpace(), ref`value`], {
    key: buildIdentifier(key),
    mapOperator: s_node('Instruction', 'Punctuator', ':'),
    value: buildExpression(value),
  });
};

const buildString = (value) => {
  const terminals = [];
  let literal = '';
  for (const chr of value) {
    if (chr === "'") {
      if (literal)
        terminals.push(
          freeze({
            type: 'Literal',
            value: literal,
          }),
        );
      terminals.push(
        e_node(
          'String',
          'Escape',
          [ref`escape`, ref`escapee`],
          {
            escape: s_node('String', 'Punctuator', '\\'),
            escapee: s_node('String', 'Literal', "'"),
          },
          { cooked: chr },
        ),
      );
    } else if (chr === '\\') {
      if (literal)
        terminals.push({
          type: 'Literal',
          value: literal,
        });
      terminals.push(
        e_node(
          'String',
          'Escape',
          [ref`escape`, ref`escapee`],
          {
            escape: s_node('String', 'Punctuator', '\\'),
            escapee: s_node('String', 'Literal', '\\'),
          },
          { cooked: chr },
        ),
      );
    } else {
      literal += chr;
    }
  }
  if (literal)
    terminals.push(
      freeze({
        type: 'Literal',
        value: literal,
      }),
    );
  return node(
    'String',
    'String',
    [ref`open`, ref`content`, ref`close`],
    {
      open: s_node('String', 'Punctuator', "'"),
      content: interpolateString(terminals),
      close: s_node('String', 'Punctuator', "'"),
    },
    {},
  );
};

const buildBoolean = (value) => {
  return value
    ? node(
        'Instruction',
        'Boolean',
        [ref`value`],
        {
          value: s_node('Instruction', 'Keyword', 'true'),
        },
        {},
      )
    : node(
        'Instruction',
        'Boolean',
        [ref`value`],
        {
          value: s_node('Instruction', 'Keyword', 'false'),
        },
        {},
      );
};

const buildNull = () => {
  return node(
    'Instruction',
    'Null',
    [ref`value`],
    {
      value: s_node('Instruction', 'Keyword', 'null'),
    },
    {},
  );
};

const buildArray = (elements) => {
  return node(
    'Instruction',
    'Array',
    [ref`open`, ref`elements[]`, ref`close`],
    {
      open: s_node('Instruction', 'Punctuator', '['),
      elements: [...interpolateArray(spread(elements, buildSpace))],
      close: s_node('Instruction', 'Punctuator', ']'),
    },
    {},
  );
};

const buildTuple = (elements) => {
  return node(
    'Instruction',
    'Tuple',
    [ref`open`, ref`values[]`, ref`close`],
    {
      open: s_node('Instruction', 'Punctuator', '('),
      values: [...interpolateArray(spread(elements, buildSpace))],
      close: s_node('Instruction', 'Punctuator', ')'),
    },
    {},
  );
};

const buildObject = (properties) => {
  return node(
    'Instruction',
    'Object',
    [ref`open`, ref`properties[]`, ref`close`],
    {
      open: s_node('Instruction', 'Punctuator', '{'),
      properties: [
        ...interpolateArray(
          spread(Object.entries(properties).map(([key, value]) => buildProperty(key, value))),
        ),
      ],
      close: s_node('Instruction', 'Punctuator', '}'),
    },
    {},
  );
};

const buildSpace = () => {
  return t_node('Comment', null, [t_node('Space', 'Space', lit` `)]);
};

const buildIdentifier = (name) => {
  return node('Instruction', 'Identifier', [buildLiteral(name)]);
};

const buildAttribute = (key, value) => {
  return buildNode('CSTML', 'Attribute', [ref`key`, ref`mapOperator`, ref`value`], {
    key: buildIdentifier(key),
    mapOperator: s_node('CSTML', 'Punctuator', '='),
    value: buildExpression(value),
  });
};

const buildExpression = (expr) => {
  if (expr == null) return buildNull();

  switch (typeof expr) {
    case 'boolean':
      return buildBoolean(expr);
    case 'string':
      return buildString(expr);
    case 'object': {
      switch (getPrototypeOf(expr)) {
        case Array.prototype:
          return buildArray(expr);
        case Object.prototype:
          if (expr.type && expr.language && expr.children && expr.properties) {
            return expr;
          }
          return buildObject(expr);
        default:
          throw new Error();
      }
    }
    default:
      throw new Error();
  }
};

const nodeFlags = freeze({ syntactic: false, escape: false, trivia: false });

const buildNode = (language, type, children = [], properties = {}, attributes = {}) =>
  freeze({
    flags: nodeFlags,
    language,
    type,
    children: freeze(children),
    properties: freeze(properties),
    attributes: freeze(attributes),
  });

const syntacticFlags = freeze({ syntactic: true, escape: false, trivia: false });

const buildSyntacticNode = (language, type, value, attributes = {}) =>
  freeze({
    flags: syntacticFlags,
    language,
    type,
    children: [buildLiteral(value)],
    properties: freeze({}),
    attributes: freeze(attributes),
  });

const escapeFlags = freeze({ syntactic: false, escape: true, trivia: false });

const buildEscapeNode = (language, type, children = [], properties = {}, attributes = {}) =>
  freeze({
    flags: escapeFlags,
    language,
    type,
    children: freeze(children),
    properties: freeze(properties),
    attributes: freeze(attributes),
  });

const syntacticEscapeFlags = freeze({ syntactic: true, escape: true, trivia: false });

const buildSyntacticEscapeNode = (
  language,
  type,
  children = [],
  properties = {},
  attributes = {},
) =>
  freeze({
    flags: syntacticEscapeFlags,
    language,
    type,
    children: freeze(children),
    properties: freeze(properties),
    attributes: freeze(attributes),
  });

const triviaFlags = freeze({ syntactic: false, escape: false, trivia: true });

const buildTriviaNode = (language, type, children = [], properties = {}, attributes = {}) =>
  freeze({
    flags: triviaFlags,
    language,
    type,
    children: freeze(children),
    properties: freeze(properties),
    attributes: freeze(attributes),
  });

const stripArray = (val) => {
  if (isArray(val)) {
    if (val.length > 1) {
      throw new Error();
    }
    return val[0];
  } else {
    return val;
  }
};

const ref = (path) => {
  if (isArray(path)) {
    const pathIsArray = path[0].endsWith('[]');
    const name = pathIsArray ? path[0].slice(0, -2) : path[0];
    return buildReference(name, pathIsArray);
  } else {
    const { name, pathIsArray } = path;
    return buildReference(name, pathIsArray);
  }
};

const lit = (str) => buildLiteral(stripArray(str));

const gap = buildGap;
const nodeOpen = buildNodeOpenTag;
const fragOpen = buildFragmentOpenTag;
const nodeClose = buildNodeCloseTag;
const fragClose = buildFragmentCloseTag;
const node = buildNode;
const s_node = buildSyntacticNode;
const e_node = buildEscapeNode;
const s_e_node = buildSyntacticEscapeNode;
const t_node = buildTriviaNode;

module.exports = {
  buildProperty,
  buildString,
  buildBoolean,
  buildNull,
  buildArray,
  buildTuple,
  buildObject,
  buildExpression,
  buildSpace,
  buildIdentifier,
  buildAttribute,
  buildReference,
  buildGap,
  buildNodeOpenTag,
  buildFragmentOpenTag,
  buildNodeCloseTag,
  buildFragmentCloseTag,
  buildLiteral,
  buildNode,
  buildSyntacticNode,
  buildEscapeNode,
  buildSyntacticEscapeNode,
  buildTriviaNode,
  ref,
  lit,
  gap,
  nodeOpen,
  fragOpen,
  nodeClose,
  fragClose,
  node,
  s_node,
  e_node,
  s_e_node,
  t_node,
};
