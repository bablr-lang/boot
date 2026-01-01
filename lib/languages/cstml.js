import * as sym from '@bablr/agast-vm-helpers/symbols';
import JSON from './json.js';
import { get } from '@bablr/agast-helpers/tree';

const _ = /\s+/y;
const PN = null;
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
      'DoctypeTag',
      'BoundNode',
      'Property',
      'ReferenceTag',
      'ReferenceFlags',
      'Identifier',
      'IdentifierContent',
      'GlobalIdentifier',
      'NullTag',
      'GapTag',
      'ShiftTag',
      'TreeNode',
      'NullNode',
      'GapNode',
      'IdentifierPath',
      'BindingSegment',
      'OpenNodeTag',
      'CloseNodeTag',
      'LiteralTag',
      'BindingTag',
      'AttributeDefinition',
      'Number',
      'Digit',
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
  [
    'Expression',
    new Set(['ShiftExpression', 'BindingExpression', 'TreeNode', 'NullNode', 'GapNode']),
  ],
]);

export const grammar = class CSTMLMiniparserGrammar {
  Document(p) {
    p.eatProduction('DoctypeTag', { path: 'doctype' });
    p.eatMatchTrivia(_);
    p.eatProduction('Expression', { path: 'tree' });
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

  TreeNode(p, props) {
    let open = p.eatProduction('OpenNodeTag', { path: 'openTag', noInterpolate: true }, props);

    p.eatMatchTrivia(_);

    if (open.value.attributes.selfClosing) {
      let token = !!get(['flags', 'token'], open);

      while (p.atExpression || !(p.match(/<\/[^/]/y) || p.done)) {
        p.eatProduction('NodeChild', { path: 'children[]' }, { token });
        p.eatMatchTrivia(_);
      }

      p.eatProduction('CloseNodeTag', { path: 'closeTag', noInterpolate: true });
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
    p.eat('{', PN, { path: 'openToken' });
    p.eatMatchTrivia(_);
    p.eatProduction('IdentifierPath', { path: 'key' });
    p.eatMatchTrivia(_);
    p.eat(':', PN, { path: 'sigilToken' });
    p.eatMatchTrivia(_);
    p.eatProduction('JSON:Expression', { path: 'value' });
    p.eatMatchTrivia(_);
    p.eat('}', PN, { path: 'closeToken' });
  }

  Property(p) {
    if (p.match(/[a-zA-Z`\\\u{80}-\u{10ffff}.#@_]/uy)) {
      p.eatProduction('ReferenceTag', { path: 'referenceTag' });
    }
    p.eatMatchTrivia(_);
    p.eatProduction('Expression', {
      path: 'value',
    });
  }

  NullNode(p) {
    p.eatProduction('NullTag', { path: 'sigilTag' });
  }

  GapNode(p) {
    p.eatProduction('GapTag', { path: 'sigilTag' });
  }

  Node(p) {
    if (p.match('null')) {
      p.eatProduction('NullNode');
    } else if (p.match('<//>')) {
      p.eatProduction('GapNode');
    } else if (p.match('</>') || p.match('<!')) {
      p.fail();
    } else {
      p.eatProduction('TreeNode', { propertyValue: true });
    }
  }

  NodeFlags(p, props) {
    let token = !!(p.eatMatch('*', PN, { path: 'tokenToken' }) || props.token);
    let hasGap = !!p.eatMatch('$', PN, { path: 'hasGapToken' });
    let fragment = !!p.eatMatch('_', PN, { path: 'fragmentToken' });
    let multiFrag = !!p.eatMatch('_', PN, { path: 'multiFragmentToken' });
    let cover = fragment && !multiFrag;

    return { attrs: { token, hasGap, fragment, cover } };
  }

  OpenNodeTag(p) {
    if (p.match(/['"]/y)) {
      p.eatProduction('NodeFlags', { path: 'flags' }, { token: true });
      p.eatProduction('JSON:String', { path: 'literalValue' });
      return;
    }

    p.eat('<', PN, { path: 'openToken' });

    let flags = null;
    if (!p.atExpression) {
      flags = p.eatProduction('NodeFlags', { path: 'flags' });
    }

    let sp = null;

    let fragmentFlag = get('fragmentToken', flags);

    if (!fragmentFlag && !p.match(/./sy)) {
      throw new Error();
    }

    if (!fragmentFlag || p.match(/[a-zA-Z`u{80}-\u{10ffff}]/uy)) {
      p.eatProduction('Identifier', { path: 'name' });
      sp = p.eatMatchTrivia(_);
    }

    if (!fragmentFlag) {
      if (sp && (p.match(/['"]/y) || p.atExpression)) {
        p.eatProduction('JSON:String', { path: 'literalValue' });

        sp = p.eatMatchTrivia(_);
      }

      if (p.match('{') || p.atExpression) {
        p.eatProduction('JSON:Object', { path: 'attributes' });
        sp = p.eatMatchTrivia(_);
      }

      p.eatMatchTrivia(_);
    }
    let sc = p.eatMatch('/', PN, { path: 'selfClosingToken' });
    p.eat('>', PN, { path: 'closeToken' });

    const selfClosing = !sc && (p.path.depth > 0 || p.span.type !== 'Bare');

    return { attrs: { selfClosing } };
  }

  CloseNodeTag(p) {
    p.eat('</', PN, { path: 'openToken' });
    p.eat('>', PN, { path: 'closeToken' });
  }

  Expression(p) {
    p.eatProduction('BoundNode');

    p.eatMatchTrivia('_');

    if (p.match('^^^')) {
      return { shift: 'ShiftExpression' };
    }
  }

  BoundNode(p) {
    while (p.match(':')) {
      p.eatProduction('BindingTag', { path: 'bindingTags' });
      p.eatMatchTrivia(_);
    }
    p.eatProduction('Node', { path: 'node' });
  }

  ShiftExpression(p) {
    p.eatProduction('BoundNode', { path: 'original' });
    p.eatMatchTrivia(_);
    p.eatProduction('ShiftTag', { path: 'sigilTag' });
    p.eatMatchTrivia(_);
    p.eatProduction('TreeNode', { path: 'value' });
  }

  BindingTag(p) {
    p.eat(':', PN, { path: 'openToken' });

    p.eatMatchTrivia(_);
    let first = true;
    while (!p.match(':') && (first || p.match('/'))) {
      if (!first) {
        p.eat('/', PN, { path: '#separatorTokens' });
      }
      p.eatProduction('BindingSegment', { path: 'segments[]' });
      p.eatMatchTrivia(_);
      first = false;
    }
    p.eat(':', PN, { path: 'closeToken' });
  }

  BindingSegment(p) {
    p.eatMatchTrivia(_);
    if (p.match('..')) {
      p.eat('..', PN, { path: 'path' });
    } else {
      p.eatProduction('Identifier', { path: 'path' });
    }
    p.eatMatchTrivia(_);
  }

  IdentifierPath(p) {
    let first = true;
    while (first || p.match('.')) {
      if (!first) {
        p.eat('.', PN, { path: '#separatorTokens' });
      }

      p.eatProduction('Identifier', { path: 'segments[]' });
      first = false;
    }
  }

  Identifier(p) {
    let res, q;
    q = p.match('`');
    if (q) p.eat('`', PN, { path: 'openToken' });

    p.eatProduction('IdentifierContent', { path: 'content' }, { quoted: !!q });

    if (q) p.eat('`', PN, { path: 'closeToken' });
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
    p.eatMatchTrivia(_);
    if (p.match('{')) {
      p.eatProduction('AttributeDefinition');
    } else if (p.match('null')) {
      p.eatProduction('NullTag');
    } else if (p.match(/[.#@_a-zA-Z\u0060\u{80}-\u{10ffff}]/uy)) {
      p.eatProduction('ReferenceTag');

      p.eatMatchTrivia(_);
      if (p.match(/[*$#:[]/y)) p.fail();
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
    p.eatMatchTrivia(_);
  }

  ReferenceTag(p) {
    let type;
    if ((type = p.match(/\.\.|[.#@_]/y))) {
      p.eat(type, PN, { path: 'type' });
    }

    if (!type || type === '#') {
      p.eatProduction('Identifier', { path: 'name' });
    }
    p.eatMatchTrivia(_);

    let isArray = !!p.match('[');
    if (isArray) {
      p.eat('[', PN, { path: 'openIndexToken' });
      p.eatMatchTrivia(_);
      p.eat(']', PN, { path: 'closeIndexToken' });
    }

    p.eatProduction('ReferenceFlags', { path: 'flags' });
    p.eatMatchTrivia(_);
    p.eat(':', PN, { path: 'mapToken' });

    return { attrs: { isArray } };
  }

  ReferenceFlags(p) {
    p.eatMatch('+', PN, { path: 'expressionToken' });
    p.eatMatch('*', PN, { path: 'intrinsicToken' });
    p.eatMatch('$', PN, { path: 'hasGapToken' });
  }

  ShiftTag(p) {
    p.eat('^^^', PN, { path: 'sigilToken' });
  }
};

export default { name, canonicalURL, dependencies, covers, grammar };
