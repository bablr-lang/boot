const objectEntries = require('iter-tools/methods/object-entries');

const { buildCovers } = require('../utils.js');
const sym = require('@bablr/boot-helpers/symbols');

const _ = /\s+/y;
const PN = 'Punctuator';
const ID = 'Identifier';
const KW = 'Keyword';

const name = 'CSTML';

const canonicalURL = 'https://bablr.org/languages/core/en/cstml';

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
    'ReferenceTag',
    'TagType',
    'NullTag',
    'GapTag',
    'Node',
    'Fragment',
    'IdentifierPath',
    'OpenNodeTag',
    'CloseNodeTag',
    'OpenFragmentTag',
    'CloseFragmentTag',
    'Tag',
    'Number',
    'Digit',
    'String',
    'Content',
    'UnsignedInteger',
    'Flags',
  ],
  [sym.fragment]: ['Attributes'],
  Attribute: ['MappingAttribute', 'BooleanAttribute'],
  AttributeValue: ['String', 'Number'],
  TagType: ['Identifier', 'GlobalIdentifier'],
  Tag: ['LiteralTag', 'Trivia'],
  PropertyValue: ['GapTag', 'Node', 'NullTag'],
  EmbeddedTag: ['LiteralTag'],
  Number: ['Integer', 'Infinity'],
});

const grammar = class CSTMLMiniparserGrammar {
  // @Node
  Document(p) {
    p.eatProduction('DoctypeTag', { path: 'doctype' });
    p.eatMatchTrivia(_);
    p.eatProduction('Fragment', { path: 'tree' });
  }

  // @Node
  DoctypeTag(p) {
    p.eat('<!', PN, { path: 'openToken' });
    p.eatProduction('UnsignedInteger', { path: 'version' });
    p.eat(':', PN, { path: 'versionSeparatorToken' });
    p.eat('cstml', KW, { path: 'doctypeToken' });

    let sp = p.eatMatchTrivia(_);

    if ((sp && p.match(/!?[a-zA-Z]/y)) || p.atExpression) {
      p.eatProduction('Attributes');
      sp = p.eatMatchTrivia(_);
    }

    p.eat('>', PN, { path: 'closeToken' });
  }

  // @Node
  NullTag(p) {
    p.eat('null', KW, { path: 'sigilToken' });
  }

  // @Node
  GapTag(p) {
    p.eat('<//>', PN, { path: 'sigilToken' });
  }

  // @Node
  Node(p) {
    let open = p.eatProduction('OpenNodeTag', { path: 'open' });

    p.eatMatchTrivia(_);

    if (open.properties.flags?.token) {
      p.eatProduction('NodeChild', { path: 'children[]' }, { token: true });
      p.eatMatchTrivia(_);
    } else if (!open.properties.selfClosingTagToken) {
      while (!(p.match('</') || p.done)) {
        p.eatProduction('NodeChild', { path: 'children[]' });
        p.eatMatchTrivia(_);
      }
    }

    if (!open.properties.selfClosingTagToken) {
      p.eatProduction('CloseNodeTag', { path: 'close' });
    }
  }

  NodeChild(p, _, props) {
    const { token } = props || {};

    if (token) {
      if (p.match(/<\*?@/y)) {
        p.eatProduction('Node');
      } else {
        p.eatProduction('LiteralTag');
      }
    } else {
      if (p.match(/<\*?#/y)) {
        p.eatProduction('Node');
      } else if (p.match(/[a-zA-Z]|\./y)) {
        p.eatProduction('Property');
      } else if (p.match(/['"]/y)) {
        p.eatProduction('LiteralTag');
      }
    }
  }

  // @Node
  Fragment(p) {
    let open = p.eatProduction('OpenFragmentTag', { path: 'open' });

    p.eatMatchTrivia(_);

    if (open.properties.flags?.token) {
      p.eatProduction('NodeChild', { path: 'children[]' }, { token: true });
      p.eatMatchTrivia(_);
    }

    while (!(p.match('</') || p.done)) {
      p.eatProduction('NodeChild', { path: 'children[]' });
      p.eatMatchTrivia(_);
    }

    p.eatProduction('CloseFragmentTag', { path: 'close' });
  }

  // @Node
  Property(p) {
    p.eatProduction('ReferenceTag', { path: 'reference' });
    p.eatMatchTrivia(_);
    p.eatProduction('PropertyValue', { path: 'value' });
  }

  PropertyValue(p) {
    if (p.match('null')) {
      p.eatProduction('NullTag');
    } else if (p.match('<//>')) {
      p.eatProduction('GapTag');
    } else {
      p.eatProduction('Node');
    }
  }

  // @Node
  Flags(p) {
    let tr = p.eatMatch('#', PN, { path: 'triviaToken' });
    p.eatMatch('*', PN, { path: 'tokenToken' });
    let esc = p.eatMatch('@', PN, { path: 'escapeToken' });
    let exp = p.eatMatch('+', PN, { path: 'expressionToken' });
    p.eatMatch('$', PN, { path: 'hasGapToken' });

    if ((tr && esc) || (exp && (tr || esc))) throw new Error();
  }

  // @Node
  OpenNodeTag(p) {
    p.eat('<', PN, { path: 'openToken', startSpan: 'Tag', balanced: '>' });

    let flags = null;
    if (!p.atExpression) {
      flags = p.eatProduction('Flags', { path: 'flags' });
    }

    if (p.done) {
      p.eat('>', PN, { path: 'closeToken', endSpan: 'Tag', balancer: true });
      return;
    }

    p.eatProduction('TagType', { path: 'type' });

    let sp = p.eatMatchTrivia(_);

    let iv;

    if (sp && (p.match(/['"]/y) || p.atExpression)) {
      iv = p.eatProduction('String', { path: 'intrinsicValue' });

      sp = p.eatMatchTrivia(_);
    }

    if (!flags.properties.tokenToken && iv) {
      throw new Error();
    }

    if ((sp && p.match(/[a-zA-Z]+/y)) || p.atExpression) {
      p.eatProduction('Attributes');
      sp = p.eatMatchTrivia(_);
    }

    p.eatMatchTrivia(_);
    p.eatMatch('/', PN, { path: 'selfClosingTagToken' });
    p.eat('>', PN, { path: 'closeToken', endSpan: 'Tag', balancer: true });
  }

  // @Node
  CloseNodeTag(p) {
    p.eat('</', PN, { path: 'openToken', startSpan: 'Tag', balanced: '>' });
    p.eat('>', PN, { path: 'closeToken', endSpan: 'Tag', balancer: true });
  }

  // @Node
  OpenFragmentTag(p) {
    p.eat('<', PN, { path: 'openToken', startSpan: 'Tag', balanced: '>' });

    let flags = null;
    if (!p.atExpression) {
      flags = p.eatProduction('Flags', { path: 'flags' });
    }

    if (p.done) {
      p.eat('>', PN, { path: 'closeToken', endSpan: 'Tag', balancer: true });
      return;
    }
  }

  // @Node
  CloseFragmentTag(p) {
    p.eat('</', PN, { path: 'openToken', startSpan: 'Tag', balanced: '>' });
    p.eat('>', PN, { path: 'closeToken', endSpan: 'Tag', balancer: true });
  }

  // @Fragment
  Attributes(p) {
    let sp = true;
    while (sp && (p.match(/!?[a-zA-Z]/y) || p.atExpression)) {
      if (p.atExpression) {
        p.eatProduction('Attributes'); // ??
      } else {
        p.eatProduction('Attribute', { path: 'attributes[]' });
      }
      if (p.match(/\s+!?[a-zA-Z]/y) || (p.match(/\s+$/y) && !p.quasisDone)) {
        sp = p.eatMatchTrivia(_);
      } else {
        sp = false;
      }
    }
  }

  // @Cover
  Attribute(p) {
    if (p.match(/[a-zA-Z][a-zA-Z-_]*\s*=/y)) {
      p.eatProduction('MappingAttribute');
    } else {
      p.eatProduction('BooleanAttribute');
    }
  }

  // @Node
  BooleanAttribute(p) {
    p.eatMatch('!', KW, { path: 'negateToken' });
    p.eat(/[a-zA-Z][a-zA-Z-_]*/y, ID, { path: 'key' });
  }

  // @Node
  MappingAttribute(p) {
    p.eat(/[a-zA-Z][a-zA-Z-_]*/y, ID, { path: 'key' });
    p.eatMatchTrivia(_);
    p.eat('=', PN, { path: 'mapToken' });
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
    if (p.match(/['"]|[a-zA-Z\.]+:/y)) {
      p.eatProduction('LanguageReference', { path: 'language' });
      p.eat(':', PN, { path: 'namespaceSeparatorToken' });
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
    p.eatLiteral(/[a-zA-Z][a-zA-Z-_]*/y);
  }

  // @Cover
  Tag(p) {
    if (p.match(/['"]/y)) {
      p.eatProduction('LiteralTag');
    } else {
      throw new Error();
    }
  }

  // @Node
  ReferenceTag(p) {
    if (p.match('.')) {
      p.eat('.', PN, { path: 'name' });
    } else {
      p.eatProduction('Identifier', { path: 'name' });
    }
    p.eatMatchTrivia(_);
    p.eatMatch('[]', PN, { path: 'arrayToken' });
    p.eatMatchTrivia(_);
    p.eat(':', PN, { path: 'mapToken' });
  }

  // @Cover
  EmbeddedTag(p) {
    if (p.match(/!['"]/y)) {
      p.eatProduction('Escape');
    } else if (p.match(/['"]/y)) {
      p.eatProduction('LiteralTag');
    } else {
      throw new Error();
    }
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

    p.eat(q, PN, { path: 'openToken', startSpan: span, balanced: q });
    while (p.match(/./sy) || p.atExpression) {
      p.eatProduction('Content', { path: 'content' });
    }
    p.eat(q, PN, { path: 'closeToken', endSpan: span, balancer: true });
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
