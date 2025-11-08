import * as sym from '@bablr/agast-vm-helpers/symbols';
import JSON from './json.js';
import { get } from '@bablr/agast-helpers/tree';

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
      'IdentifierContent',
      'GlobalIdentifier',
      'NullTag',
      'GapTag',
      'ShiftTag',
      'Node',
      'IdentifierPath',
      'OpenNodeTag',
      'CloseNodeTag',
      'LiteralTag',
      'BindingTag',
      'AttributeDefinition',
      'Number',
      'Digit',
      'Content',
      'NodeFlags',
    ]),
  ],
  [
    'Tag',
    new Set([
      'DoctypeTag',
      'ReferenceTag',
      'NullTag',
      'GapTag',
      'ShiftTag',
      'OpenNodeTag',
      'CloseNodeTag',
      'LiteralTag',
      'BindingTag',
      'AttributeDefinition',
    ]),
  ],
]);

export const grammar = class CSTMLMiniparserGrammar {
  Document(p) {
    p.eatProduction('DoctypeTag', { path: 'doctype' });
    p.eatMatchTrivia(_);
    p.eatProduction('Node', { path: 'tree' }, { forceFragment: true });
  }

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

  NullTag(p) {
    p.eat('null', KW, { path: 'sigilToken' });
  }

  GapTag(p) {
    p.eat('<//>', PN, { path: 'sigilToken' });
  }

  LiteralTag(p) {
    p.eatProduction('JSON:String', { path: 'value' });
  }

  Node(p, props) {
    let open = p.eatProduction('OpenNodeTag', { path: 'open', noInterpolate: true }, props);

    p.eatMatchTrivia(_);

    if (open.attributes.balanced) {
      let token = !!get(['flags', 'token'], open);

      while (p.atExpression || !(p.match(/<\/[^/]/y) || p.done)) {
        p.eatProduction('NodeChild', { path: 'children[]' }, { token });
        p.eatMatchTrivia(_);
      }

      p.eatProduction('CloseNodeTag', { path: 'close', noInterpolate: true });
    }
  }

  NodeChild(p, props) {
    const { token } = props || {};

    if (p.match('{')) {
      p.eatProduction('AttributeDefinition');
    }

    if (token) {
      if (p.match(/<\*?@/y)) {
        p.eatProduction('Property');
      } else {
        p.eatProduction('LiteralTag');
      }
    } else {
      if (p.match(/[:<a-zA-Z`\\\u{80}-\u{10ffff}.]|[.#@_]/uy) || p.atExpression) {
        p.eatProduction('Property');
      } else if (p.match(/['"]/y)) {
        p.eatProduction('Property');
      } else {
        p.fail();
      }
    }
  }

  AttributeDefinition(p) {
    p.eat('{', PN, { path: 'openToken', balanced: '}' });
    p.eatMatchTrivia(_);
    p.eatProduction('IdentifierPath', { path: 'key' });
    p.eatMatchTrivia(_);
    p.eat(':', PN, { path: 'sigilToken' });
    p.eatMatchTrivia(_);
    p.eatProduction('JSON:Expression', { path: 'value' });
    p.eatMatchTrivia(_);
    p.eat('}', PN, { path: 'closeToken', balancer: true });
  }

  Property(p) {
    let ref = null;
    if (p.match(/[a-zA-Z`\\\u{80}-\u{10ffff}.#@_]/uy)) {
      ref = p.eatProduction('ReferenceTag', { path: 'reference' });
    }
    p.eatMatchTrivia(_);
    if (p.match(':')) {
      p.eatProduction('BindingTag', { path: 'binding' });
      p.eatMatchTrivia(_);
    }
    let refType = ref && get('type', ref);
    p.eatProduction('PropertyValue', {
      path: 'value',
    });
  }

  PropertyValue(p) {
    if (p.match('null')) {
      p.eatProduction('NullTag');
    } else if (p.match('<//>')) {
      p.eatProduction('GapTag');
    } else {
      p.eatProduction('Node', { propertyValue: true });
    }
  }

  NodeFlags(p) {
    p.eatMatch('*', PN, { path: 'tokenToken' });
    p.eatMatch('$', PN, { path: 'hasGapToken' });
    p.eatMatch('_', PN, { path: 'fragmentToken' });
    p.eatMatch('_', PN, { path: 'multiFragmentToken' });
  }

  OpenNodeTag(p, { forceFragment = false, propertyValue = false } = {}) {
    if (p.match(/['"]/y)) {
      p.eatProduction('JSON:String', { path: 'literalValue' });
      return;
    }

    p.eat('<', PN, { path: 'openToken', startSpan: 'Tag', balanced: '>' });

    let flags = null;
    if (!p.atExpression) {
      flags = p.eatProduction('NodeFlags', { path: 'flags' });
    }

    let sp = null;

    let fragmentFlag = get('fragmentToken', flags);
    let multiFragmentFlag = get('multiFragmentFlag', flags);
    let tokenFlag = get('tokenToken', flags);

    if (forceFragment && !fragmentFlag) throw new Error();

    if (!fragmentFlag && !p.match(/./sy)) {
      throw new Error();
    }

    if (!fragmentFlag) {
      p.eatProduction('Identifier', { path: 'type' });

      sp = p.eatMatchTrivia(_);

      let iv;

      if (sp && (p.match(/['"]/y) || p.atExpression)) {
        iv = p.eatProduction('JSON:String', { path: 'literalValue' });

        sp = p.eatMatchTrivia(_);
      }

      if (p.match('{') || p.atExpression) {
        p.eatProduction('JSON:Object', { path: 'attributes' });
        sp = p.eatMatchTrivia(_);
      }

      p.eatMatchTrivia(_);
    }
    let sc = p.eatMatch('/', PN, { path: 'selfClosingToken' });
    p.eat('>', PN, { path: 'closeToken', endSpan: 'Tag', balancer: true });

    const balanced = !sc && (p.path.depth > 0 || p.span.type !== 'Bare');

    return { attrs: { balanced } };
  }

  CloseNodeTag(p) {
    p.eat('</', PN, { path: 'openToken', startSpan: 'Tag', balanced: '>' });
    p.eat('>', PN, { path: 'closeToken', endSpan: 'Tag', balancer: true });
  }

  BindingTag(p) {
    p.eat(':', PN, { path: 'openToken', startSpan: 'Tag', balanced: ':' });
    if (!p.match(':')) {
      p.eatProduction('IdentifierPath', { path: 'languagePath' });
    }
    p.eat(':', PN, { path: 'closeToken', endSpan: 'Tag', balancer: true });
  }

  IdentifierPath(p) {
    let first = true;
    while (first || p.match('.')) {
      if (!first) {
        p.eat('.', PN, { path: '#separatorTokens[]' });
      }

      if (p.match('..')) {
        p.eat('..', PN, { path: 'segments[]' });
      } else {
        p.eatProduction('Identifier', { path: 'segments[]' });
      }
      first = false;
    }
  }

  Identifier(p) {
    let res, q;
    q = p.match('`');
    if (q) p.eat('`', PN, { path: 'openToken', balanced: '`' });

    p.eatProduction('IdentifierContent', { path: 'content', span: 'Identifier' }, { quoted: !!q });

    if (q) p.eat('`', PN, { path: 'closeToken', balancer: true });
  }

  IdentifierContent(p, props) {
    let { quoted = false } = props || {};

    let lit, esc;
    do {
      if ((esc = p.match('\\'))) {
        p.eatEscape(/\\(u(\{[0-9a-fA-F]\}|\d{4}))/y);
      } else {
        if (!quoted) {
          lit = p.eatMatchLiteral(/[a-zA-Z\u{80}-\u{10ffff}][a-zA-Z0-9_\u{80}-\u{10ffff}-]*/uy);
        } else {
          lit = p.eatMatchLiteral(/[^`\r\n]+/uy);
        }
      }
    } while (lit || esc);
  }

  Tag(p) {
    if (p.match('null')) {
      p.eatProduction('NullTag');
    } else if (p.match('{')) {
      p.eatProduction('AttributeDefinition');
    } else if (p.match(/[.#@a-zA-Z\u0060\u{80}-\u{10ffff}]/uy)) {
      p.eatProduction('ReferenceTag');
    } else if (p.match(':')) {
      p.eatProduction('BindingTag');
    } else if (p.match('<!')) {
      p.eatProduction('DoctypeTag');
    } else if (p.match('<//>')) {
      p.eatProduction('GapTag');
    } else if (p.match('^^^')) {
      p.eatProduction('ShiftTag');
    } else if (p.match('</')) {
      p.eatProduction('CloseNodeTag');
    } else if (p.match('<')) {
      p.eatProduction('OpenNodeTag');
    } else if (p.match(/['"]/y)) {
      p.eatProduction('LiteralTag');
    } else {
      throw new Error();
    }
  }

  ReferenceTag(p) {
    let type;
    if ((type = p.match(/[.#@_]/y))) {
      p.eat(type, PN, { path: 'type' });
    }

    if (!type || type === '#') {
      p.eatProduction('Identifier', { path: 'name' });
    }
    p.eatMatchTrivia(_);

    if (p.match('[')) {
      p.eat('[', PN, { path: 'openIndexToken', balanced: ']' });
      p.eatMatchTrivia(_);
      p.eat(']', PN, { path: 'closeIndexToken', balancer: true });
    }

    if (p.match(/[+$]/y)) {
      p.eatProduction('ReferenceFlags', { path: 'flags' });
      p.eatMatchTrivia(_);
    }
    p.eat(':', PN, { path: 'mapToken' });
  }

  ReferenceFlags(p) {
    p.eatMatch('+', PN, { path: 'expressionToken' });
    if (p.eatMatch('*', PN, { path: 'intrinsicToken' })) {
    } else {
      p.eat('$', PN, { path: 'hasGapToken' });
    }
  }

  ShiftTag(p) {
    p.eat('^^^', PN, { path: 'sigilToken' });
  }
};

export default { name, canonicalURL, dependencies, covers, grammar };
