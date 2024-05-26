const objectEntries = require('iter-tools-es/methods/object-entries');

const { buildCovers } = require('../utils.js');
const sym = require('../symbols.js');

const _ = /\s+/y;
const PN = 'Punctuator';
const ID = 'Identifier';
const KW = 'Keyword';
const LIT = 'Literal';

const name = 'CSTML';

const canonicalURL = 'https://bablr.org/languages/core/cstml';

const dependencies = {};

const escapables = new Map(
  objectEntries({
    n: '\n',
    r: '\r',
    t: '\t',
    0: '\0',
  }),
);

const cookEscape = (escape, span) => {
  let hexMatch;

  if (!escape.startsWith('\\')) {
    throw new Error('string escape must start with \\');
  }

  if ((hexMatch = /\\u([0-9a-f]{4})/iy.exec(escape))) {
    //continue
  } else if ((hexMatch = /\\u{([0-9a-f]+)}/iy.exec(escape))) {
    //continue
  }

  if (hexMatch) {
    return String.fromCodePoint(parseInt(hexMatch[1], 16));
  }

  const litPattern = span === 'Single' ? /\\([\\gnrt0'])/y : /\\([\\gnrt0"])/y;
  const litMatch = litPattern.exec(escape);

  if (litMatch) {
    if (litMatch[1] === 'g') {
      return null;
    } else {
      return escapables.get(litMatch[1]) || litMatch[1];
    }
  }

  throw new Error('unable to cook string escape');
};

const covers = buildCovers({
  [sym.node]: [
    'Document',
    'DocumentVersion',
    'DoctypeTag',
    'Attribute',
    'Property',
    'Reference',
    'TagType',
    'Null',
    'Gap',
    'Node',
    'IdentifierPath',
    'OpenFragmentTag',
    'OpenNodeTag',
    'CloseNodeTag',
    'CloseFragmentTag',
    'Terminal',
    'Number',
    'Digit',
    'String',
    'Content',
    'UnsignedInteger',
  ],
  [sym.fragment]: ['Attributes', 'Fragment'],
  Attribute: ['MappingAttribute', 'BooleanAttribute'],
  AttributeValue: ['String', 'Number'],
  TagType: ['Identifier', 'GlobalIdentifier'],
  Terminal: ['Literal', 'Trivia', 'Escape'],
  PropertyValue: ['Gap', 'Node', 'Null'],
  EmbeddedTerminal: ['Literal', 'Escape'],
  Number: ['Integer', 'Infinity'],
});

const grammar = class CSTMLMiniparserGrammar {
  Fragment(p) {
    p.eatMatchTrivia(_);
    p.eatProduction('OpenFragmentTag', { path: 'open' });
    p.eatMatchTrivia(_);
    while (p.match(/<[^/]/y) || p.atExpression) {
      p.eatProduction('Node', { path: 'root' });
      p.eatMatchTrivia(_);
    }
    p.eatProduction('CloseFragmentTag', { path: 'close' });
    p.eatMatchTrivia(_);
  }

  // @Node
  Document(p) {
    p.eatProduction('DoctypeTag', { path: 'doctype' });
    p.eatProduction('Fragment', { path: 'tree' });
  }

  // @Node
  DoctypeTag(p) {
    p.eat('<!', PN, { path: 'open' });
    p.eatProduction('UnsignedInteger', { path: 'version' });
    p.eat(':', PN, { path: 'versionSeparator' });
    p.eat('cstml', KW, { path: 'doctype' });

    let sp = p.eatMatchTrivia(_);

    if ((sp && p.match(/\w+/y)) || p.atExpression) {
      p.eatProduction('Attributes');
      sp = p.eatMatchTrivia(_);
    }

    p.eat('>', PN, { path: 'close' });
  }

  // @Node
  Null(p) {
    p.eat('null', KW, { path: 'value' });
  }

  // @Node
  Gap(p) {
    p.eat('<//>', PN, { path: 'value' });
  }

  // @Node
  Node(p) {
    if (p.match('<>')) throw new Error('Fragment is not a node');

    let open = p.eatProduction('OpenNodeTag', { path: 'open' });

    p.eatMatchTrivia(_);

    if (open.properties.flags?.token) {
      p.eatProduction('NodeChild', { path: 'children[]' }, { token: true });
      p.eatMatchTrivia(_);
    } else {
      while (!p.match('</')) {
        p.eatProduction('NodeChild', { path: 'children[]' });
        p.eatMatchTrivia(_);
      }
    }

    p.eatProduction('CloseNodeTag', { path: 'close' });
  }

  NodeChild(p, _, props) {
    const { token } = props || {};

    if (token) {
      p.eatProduction('Literal');
    } else {
      if (p.match(/<\*?#/y)) {
        p.eatProduction('Node');
      } else if (p.match(/\w/y)) {
        p.eatProduction('Property');
      } else if (p.match(/['"]/y)) {
        p.eatProduction('Literal');
      }
    }
  }

  // @Node
  Property(p) {
    p.eatProduction('Reference', { path: 'reference' });
    p.eatMatchTrivia(_);
    p.eat(':', PN, { path: 'mapOperator' });
    p.eatMatchTrivia(_);
    p.eatProduction('PropertyValue', { path: 'value' });
  }

  PropertyValue(p) {
    if (p.match('null')) {
      p.eatProduction('Null');
    } else if (p.match('<//>')) {
      p.eatProduction('Gap');
    } else {
      p.eatProduction('Node');
    }
  }

  // @Node
  OpenFragmentTag(p) {
    p.eat('<', PN, { path: 'open', startSpan: 'Tag', balanced: '>' });
    p.eat('>', PN, { path: 'close', endSpan: 'Tag', balancer: true });
  }

  // @Node
  OpenNodeTag(p) {
    p.eat('<', PN, { path: 'open', startSpan: 'Tag', balanced: '>' });

    let tr = p.eatMatch('#', PN, { path: 'triviaFlag' });
    let tok = p.eatMatch('*', PN, { path: 'tokenFlag' });
    let esc = p.eatMatch('@', PN, { path: 'escapeFlag' });
    let exp = p.eatMatch('+', PN, { path: 'expressionFlag' });

    if ((tr && esc) || (exp && (tr || esc))) throw new Error();

    p.eatProduction('TagType', { path: 'type' });

    let sp = p.eatMatchTrivia(_);

    let iv;
    if (tok && sp && (p.match(/['"/]/y) || p.atExpression)) {
      iv = p.eatProduction('String', { path: 'intrinsicValue' });

      sp = p.eatMatchTrivia(_);
    }

    if ((sp && p.match(/\w+/y)) || p.atExpression) {
      p.eatProduction('Attributes');
      sp = p.eatMatchTrivia(_);
    }

    p.eatMatchTrivia(_);
    if (iv) {
      p.eat('/', PN, { path: 'selfClosingToken' });
    }
    p.eat('>', PN, { path: 'close', endSpan: 'Tag', balancer: true });
  }

  // @Node
  CloseNodeTag(p) {
    p.eat('</', PN, { path: 'open', startSpan: 'Tag', balanced: '>' });
    p.eat('>', PN, { path: 'close', endSpan: 'Tag', balancer: true });
  }

  // @Node
  CloseFragmentTag(p) {
    p.eat('</', PN, { path: 'open', startSpan: 'Tag', balanced: '>' });
    p.eat('>', PN, { path: 'close', endSpan: 'Tag', balancer: true });
  }

  // @Fragment
  Attributes(p) {
    let sp = true;
    while (sp && (p.match(/\w+/y) || p.atExpression)) {
      if (p.atExpression) {
        p.eatProduction('Attributes'); // ??
      } else {
        p.eatProduction('Attribute', { path: 'attributes[]' });
      }
      if (p.match(/\s+\w/y) || (p.match(/\s+$/y) && !p.quasisDone)) {
        sp = p.eatMatchTrivia(_);
      } else {
        sp = false;
      }
    }
  }

  // @Cover
  Attribute(p) {
    if (p.match(/\w[\w-_]*\s*=/y)) {
      p.eatProduction('MappingAttribute');
    } else {
      p.eatProduction('BooleanAttribute');
    }
  }

  // @Node
  BooleanAttribute(p) {
    p.eat('!', KW, { path: 'negated' });
    p.eat(/\w+/y, ID, { path: 'key' });
  }

  // @Node
  MappingAttribute(p) {
    p.eat(/\w+/y, LIT, { path: 'key' });
    p.eatMatchTrivia(_);
    p.eat('=', PN, { path: 'mapOperator' });
    p.eatMatchTrivia(_);
    p.eatProduction('AttributeValue', { path: 'value' });
  }

  // @Cover
  AttributeValue(p) {
    if (p.match(/['"]/y)) {
      p.eatProduction('String');
    } else if (p.match(/[\d+-]/y)) {
      p.eatProduction('Number');
    }
  }

  TagType(p) {
    if (p.match(/[\w.]+:/y)) {
      p.eatProduction('LanguageReference', { path: 'language' });
      p.eat(':', PN, { path: 'namespaceOperator' });
      p.eatProduction('Identifier', { path: 'type' });
    } else {
      p.eatProduction('Identifier', { path: 'type' });
    }
  }

  LanguageReference(p) {
    if (p.match(/['"]/y)) {
      p.eatProduction('String');
    } else {
      p.eatProduction('IdentifierPath');
    }
  }

  IdentifierPath(p) {
    p.eatProduction('Identifier', { path: 'segments[]' });
    while (p.match('.')) {
      p.eat('.', PN, { path: 'separators[]' });
      p.eatProduction('Identifier', { path: 'segments[]' });
    }
  }

  // @Node
  Identifier(p) {
    p.eatLiteral(/\w[\w-_]*/y);
  }

  // @Cover
  Terminal(p) {
    if (p.match(/!['"]/y)) {
      p.eatProduction('Escape');
    } else if (p.match(/#['"]/y)) {
      p.eatProduction('Trivia');
    } else if (p.match(/['"]/y)) {
      p.eatProduction('Literal');
    } else {
      throw new Error();
    }
  }

  // @Node
  Reference(p) {
    p.eatProduction('Identifier', { path: 'name' });
    p.eatMatchTrivia(_);
    p.eatMatch('[]', PN, { path: 'arrayOperator' });
  }

  // @Cover
  EmbeddedTerminal(p) {
    if (p.match(/!['"]/y)) {
      p.eatProduction('Escape');
    } else if (p.match(/['"]/y)) {
      p.eatProduction('Literal');
    } else {
      throw new Error();
    }
  }

  // @Node
  Escape(p) {
    p.eat('!', PN, { path: 'escapeOperator' });
    p.eatProduction('String', { path: 'rawValue' });
    p.eatMatchTrivia(_);
    p.eat(':', PN, { path: 'rawOperator' });
    p.eatProduction('String', { path: 'value' });
  }

  // @Node
  Trivia(p) {
    p.eat('#', PN, { path: 'trivializeOperator' });
    p.eatProduction('String', { path: 'value' });
  }

  // @Node
  Literal(p) {
    p.eatProduction('String', { path: 'value' });
  }

  Number(p) {
    if (p.match(/-?\d/y)) {
      p.eatProduction('Integer');
    } else {
      p.eatProduction('Infinity');
    }
  }

  // @Node
  Integer(p) {
    p.eatMatch('-', 'Punctuator', { path: 'negative' });
    p.eatProduction('Digits', { path: 'digits[]' });
  }

  // @Node
  UnsignedInteger(p) {
    p.eatProduction('Digits', { path: 'digits[]' });
  }

  // @Node
  Infinity(p) {
    p.eatMatch(/[+-]/, 'Punctuator', { path: 'sign' });
    p.eat('Infinity', 'Keyword', { path: 'value' });
  }

  Digits(p) {
    while (p.match(/\d/y)) {
      p.eatProduction('Digit');
    }
  }

  // @Node
  Digit(p) {
    p.eatLiteral(/\d/y);
  }

  // @Node
  String(p) {
    const q = p.match(/['"]/y) || '"';

    const span = q === '"' ? 'Double' : 'Single';

    p.eat(q, PN, { path: 'open', startSpan: span, balanced: q });
    while (p.match(/./sy) || p.atExpression) {
      p.eatProduction('Content', { path: 'content' });
    }
    p.eat(q, PN, { path: 'close', endSpan: span, balancer: true });
  }

  // @Node
  Content(p) {
    let esc, lit;
    let i = 0;
    do {
      esc =
        p.span.type === 'Single'
          ? p.eatMatchEscape(/\\(u(\{\d{1,6}\}|\d{4})|[\\gnrt0'])/y)
          : p.eatMatchEscape(/\\(u(\{\d{1,6}\}|\d{4})|[\\gnrt0"])/y);
      lit =
        p.span.type === 'Single'
          ? p.eatMatchLiteral(/[^\r\n\0\\']+/y)
          : p.eatMatchLiteral(/[^\r\n\0\\"]+/y);
      i++;
    } while (esc || lit);
    if (i === 1 && !esc && !lit) {
      throw new Error('Invalid string content');
    }
  }
};

module.exports = { name, canonicalURL, dependencies, covers, grammar, cookEscape, escapables };
