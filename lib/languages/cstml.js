import * as sym from '@bablr/agast-vm-helpers/symbols';
import * as JSON from './json.js';

const _ = /\s+/y;
const PN = 'Punctuator';
const KW = 'Keyword';

export const name = 'CSTML';

export const canonicalURL = 'https://bablr.org/languages/core/en/cstml';

export const dependencies = {
  JSON,
};

export const covers = new Map([
  [
    sym.node,
    new Set([
      'Document',
      'DocumentVersion',
      'DoctypeTag',
      'Property',
      'ReferenceTag',
      'ReferenceFlags',
      'Identifier',
      'GlobalIdentifier',
      'NullTag',
      'GapTag',
      'Node',
      'IdentifierPath',
      'OpenNodeTag',
      'CloseNodeTag',
      'LiteralTag',
      'Trivia',
      'Number',
      'Digit',
      'Content',
      'NodeFlags',
    ]),
  ],
  ['TagType', new Set(['Identifier', 'GlobalIdentifier'])],
  ['Tag', new Set(['LiteralTag', 'Trivia'])],
  ['PropertyValue', new Set(['GapTag', 'Node', 'NullTag'])],
]);

export const grammar = class CSTMLMiniparserGrammar {
  // @Node
  Document(p) {
    p.eatProduction('DoctypeTag', { path: 'doctype' });
    p.eatMatchTrivia(_);
    p.eatProduction('Node', { path: 'tree' });
  }

  // @Node
  DoctypeTag(p) {
    p.eat('<!', PN, { path: 'openToken' });
    p.eatProduction('JSON:UnsignedInteger', { path: 'version' });
    p.eat(':', PN, { path: 'versionSeparatorToken' });
    p.eat('cstml', KW, { path: 'doctypeToken' });

    p.eatMatchTrivia(_);

    if (p.match('{') || p.atExpression) {
      p.eatProduction('JSON:Object', { path: 'attributes' });
      p.eatMatchTrivia(_);
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
      } else if (p.match(/[a-zA-Z]|[.#@]/y)) {
        p.eatProduction('Property');
      } else if (p.match(/['"]/y)) {
        p.eatProduction('LiteralTag');
      }
    }
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
  NodeFlags(p) {
    p.eatMatch('*', PN, { path: 'tokenToken' });
    p.eatMatch('$', PN, { path: 'hasGapToken' });
  }

  // @Node
  OpenNodeTag(p) {
    p.eat('<', PN, { path: 'openToken', startSpan: 'Tag', balanced: '>' });

    let flags = null;
    if (!p.atExpression) {
      flags = p.eatProduction('NodeFlags', { path: 'flags' });
    }

    let sp = null;
    let isFragment = !p.match(/['"a-zA-Z]/y);

    if (!isFragment) {
      p.eatProduction('TagType', { path: 'type' });

      sp = p.eatMatchTrivia(_);

      let iv;

      if (sp && (p.match(/['"]/y) || p.atExpression)) {
        iv = p.eatProduction('JSON:String', { path: 'intrinsicValue' });

        sp = p.eatMatchTrivia(_);
      }

      if (!flags.properties.tokenToken && iv) {
        throw new Error();
      }

      if (p.match('{') || p.atExpression) {
        p.eatProduction('Object');
        sp = p.eatMatchTrivia(_);
      }

      p.eatMatchTrivia(_);
    }
    p.eatMatch('/', PN, { path: 'selfClosingTagToken' });
    p.eat('>', PN, { path: 'closeToken', endSpan: 'Tag', balancer: true });
  }

  // @Node
  CloseNodeTag(p) {
    p.eat('</', PN, { path: 'openToken', startSpan: 'Tag', balanced: '>' });
    p.eat('>', PN, { path: 'closeToken', endSpan: 'Tag', balancer: true });
  }

  TagType(p) {
    if (p.match(/['"]|[a-zA-Z.]+:/y) || (p.atExpression && p.quasis[p.quasiIdx + 1][0] === ':')) {
      p.eatProduction('LanguageReference', { path: 'language' });
      p.eat(':', PN, { path: 'namespaceSeparatorToken' });
      p.eatProduction('Identifier', { path: 'type' });
    } else {
      p.eatProduction('Identifier', { path: 'type' });
    }
  }

  LanguageReference(p) {
    if (p.match(/['"]/y)) {
      p.eatProduction('JSON:String');
    } else {
      p.eatProduction('IdentifierPath');
    }
  }

  IdentifierPath(p) {
    p.eatProduction('Identifier', { path: 'segments[]' });
    while (p.match('.')) {
      p.eat('.', PN, { path: 'separatorTokens[]' });
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
    let name;
    if ((name = p.match(/[.#@]/y))) {
      p.eat(name, PN, { path: 'name' });
    } else {
      p.eatProduction('Identifier', { path: 'name' });
    }
    p.eatMatchTrivia(_);
    let open = p.eatMatch('[', PN, { path: 'openIndex', startSpan: 'Index', balanced: ']' });

    if (open) {
      p.eatMatchTrivia(_);

      if (p.match(/\d/)) {
        p.eatProduction('UnsignedInteger', { path: 'index' });
      }

      p.eatMatchTrivia(_);
      p.eat(']', PN, { path: 'closeIndex', endSpan: 'Index', balancer: true });
    }
    p.eatMatchTrivia(_);
    if (p.match(/[+$]/y)) {
      p.eatProduction('ReferenceFlags', { path: 'flags' });
      p.eatMatchTrivia(_);
    }
    p.eat(':', PN, { path: 'mapToken' });
  }

  // @Node
  ReferenceFlags(p) {
    p.eatMatch('+', PN, { path: 'expressionToken' });
    p.eatMatch('$', PN, { path: 'hasGapToken' });
  }

  // @Node
  Literal(p) {
    p.eatProduction('JSON:String', { path: 'value' });
  }
};
