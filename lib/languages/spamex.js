import * as sym from '@bablr/agast-vm-helpers/symbols';
import * as Regex from './regex.js';
import * as CSTML from './cstml.js';
import * as JSON from './json.js';

const _ = /\s+/y;
const PN = 'Punctuator';
const ID = 'Identifier';

export const name = 'Spamex';

export const canonicalURL = 'https://bablr.org/languages/core/en/spamex';

export const dependencies = { CSTML, JSON, Regex };

export const covers = new Map([
  [
    sym.node,
    new Set([
      'CSTML:Identifier',
      'PropertyMatcher',
      'JSON:String',
      'Regex:Pattern',
      'BasicNodeMatcher',
      'GapNodeMatcher',
      'ArrayNodeMatcher',
      'NullNodeMatcher',
      'ReferenceMatcher',
      'OpenNodeMatcher',
      'CloseNodeMatcher',
      'CSTML:NodeFlags',
      'AnyTypeMatcher',
      'LiteralTypeMatcher',
      'UnionTypeMatcher',
    ]),
  ],
  ['AttributeValue', new Set(['JSON:String', 'CSTML:Number'])],
  ['Matcher', new Set(['PropertyMatcher', 'JSON:String', 'Regex:Pattern'])],
  [
    'NodeMatcher',
    new Set(['BasicNodeMatcher', 'GapNodeMatcher', 'ArrayNodeMatcher', 'NullNodeMatcher']),
  ],
  ['StringMatcher', new Set(['JSON:String', 'Regex:Pattern'])],
  ['TypeMatcher', new Set(['AnyTypeMatcher', 'LiteralTypeMatcher', 'UnionTypeMatcher'])],
]);

export const grammar = class SpamexMiniparserGrammar {
  // @Cover
  Matcher(p) {
    if (p.match(/[a-zA-Z`\\\u{80}-\u{10ffff}.#@<]/uy)) {
      p.eatProduction('PropertyMatcher');
    } else if (p.match(/['"/]/y)) {
      p.eatProduction('StringMatcher');
    } else {
      throw new Error(`Unexpected character ${p.chr}`);
    }
  }

  // @Node
  // @CoveredBy('NodeMatcher')
  GapNodeMatcher(p) {
    p.eat('<//>', PN, { path: 'sigilToken' });
  }

  // @Node
  // @CoveredBy('NodeMatcher')
  ArrayNodeMatcher(p) {
    p.eat('[]', PN, { path: 'sigilToken' });
  }

  // @Node
  // @CoveredBy('NodeMatcher')
  NullNodeMatcher(p) {
    p.eat('null', PN, { path: 'sigilToken' });
  }

  // @Node
  // @CoveredBy('Matcher')
  PropertyMatcher(p) {
    if (p.match(/[a-zA-Z`\\\u{80}-\u{10ffff}.#@]/uy)) {
      p.eatProduction('ReferenceMatcher', { path: 'refMatcher' });
    }

    p.eatMatchTrivia(_);

    p.eatProduction('NodeMatcher', { path: 'nodeMatcher' });
  }

  // @Node
  ReferenceMatcher(p) {
    let name;
    if ((name = p.match(/[.#@]/y))) {
      name = p.eat(name, PN, { path: 'type' });
    } else if (p.match(/[a-zA-Z`\\\u{80}-\u{10ffff}]/uy)) {
      name = p.eatProduction('CSTML:Identifier', { path: 'name' });
    }

    let open =
      name && p.eatMatch('[', PN, { path: 'openIndexToken', startSpan: 'Index', balanced: ']' });

    if (open) {
      p.eatMatchTrivia(_);
      p.eat(']', PN, { path: 'closeIndexToken', endSpan: 'Index', balancer: true });
    }

    p.eatMatchTrivia(_);
    if (p.match(/[+$]/y)) {
      p.eatProduction('CSTML:ReferenceFlags', { path: 'flags' });
      p.eatMatchTrivia(_);
    }
    p.eat(':', PN, { path: 'mapToken' });
  }

  NodeMatcher(p) {
    if (p.match('<//>')) {
      p.eatProduction('GapNodeMatcher');
    } else if (p.match('<')) {
      p.eatProduction('BasicNodeMatcher');
    } else if (p.match('[')) {
      p.eatProduction('ArrayNodeMatcher');
    } else if (p.match('null')) {
      p.eatProduction('NullNodeMatcher');
    } else {
      p.fail();
    }
  }

  // @Node
  // @CoveredBy('NodeMatcher')
  BasicNodeMatcher(p) {
    let open = p.eatProduction('OpenNodeMatcher', { path: 'open' });

    if (!open.properties.selfClosingTagToken) {
      p.eatMatchTrivia(_);

      if (open.properties.flags?.token) {
        // p.eatProduction('NodeChild', { path: 'children[]' }, { token: true });
        // p.eatMatchTrivia(_);
      } else {
        // while (!(p.match('</') || p.done)) {
        //   p.eatProduction('NodeChild', { path: 'children[]' });
        //   p.eatMatchTrivia(_);
        // }
      }

      p.eatProduction('CloseNodeMatcher', { path: 'close' });
    }
  }

  // @Node
  OpenNodeMatcher(p) {
    p.eat('<', PN, { path: 'openToken', startSpan: 'Tag', balanced: '>' });

    if (!p.atExpression) {
      p.eatProduction('CSTML:NodeFlags', { path: 'flags' });
    }

    p.eatProduction('TypeMatcher', { path: 'type' });

    let sp = p.eatMatchTrivia(_);

    if (sp && ((p.match(/['"/]/y) && !p.match('/>')) || p.atExpression)) {
      p.eatProduction('StringMatcher', { path: 'intrinsicValue' });

      sp = p.eatMatchTrivia(_);
    }

    if (p.match('{') || p.atExpression) {
      p.eatProduction('JSON:Object', { path: 'attributes' });
      p.eatMatchTrivia(_);
    }

    p.eatMatchTrivia(_);
    p.eatMatch('/', PN, { path: 'selfClosingTagToken' });
    p.eat('>', PN, { path: 'closeToken', endSpan: 'Tag', balancer: true });
  }

  CloseNodeMatcher(p) {
    p.eat('</', PN, { path: 'openToken', startSpan: 'Tag', balanced: '>' });
    p.eat('>', PN, { path: 'closeToken', endSpan: 'Tag', balancer: true });
  }

  // @Cover
  TypeMatcher(p) {
    if (p.match(/['"a-zA-Z`\\\u{80}-\u{10ffff}.]/uy) || p.atExpression) {
      p.eatProduction('LiteralTypeMatcher', { path: 'type', noInterpolate: true });
    } else if (p.match('?')) {
      p.eatProduction('AnyTypeMatcher', { path: 'type' });
    } else if (p.match('[')) {
      p.eatProduction('UnionTypeMatcher', { path: 'type' });
    } else if (p.match(' ')) {
      p.eatMatchTrivia(_);
    } else {
      throw new Error();
    }
  }

  // @Node
  AnyTypeMatcher(p) {
    p.eat('?', PN, { path: 'type' });
  }

  // @Node
  LiteralTypeMatcher(p) {
    if (
      p.match(
        /(['"])[a-zA-Z:/]+\1:|[a-zA-Z\\\u{80}-\u{10ffff}.][a-zA-Z\\\u{80}-\u{10ffff}._-]*:/uy,
      ) ||
      (p.atExpression && p.quasis[p.quasiIdx + 1][0] === ':')
    ) {
      p.eatProduction('CSTML:LanguageReference', { path: 'language' });
      p.eat(':', PN, { path: 'namespaceSeparatorToken' });
      p.eatProduction('CSTML:Identifier', { path: 'name' });
    } else {
      p.eatProduction('CSTML:Identifier', { path: 'name' });
    }
  }

  // @Node
  UnionTypeMatcher(p) {
    p.eat('[', PN, { path: 'openToken', balanced: ']' });
    let sep;
    do {
      if (p.match(/['"]|[a-zA-Z`\\\u{80}-\u{10ffff}.]+/uy) || p.atExpression) {
        p.eatProduction('LiteralTypeMatcher', { path: 'elements[]', noInterpolate: true });
      } else if (p.match('?')) {
        p.eatProduction('AnyTypeMatcher', { path: 'elements[]' });
      } else if (p.match(' ')) {
        p.eatMatchTrivia(_);
      } else {
        throw new Error();
      }

      p.eatMatchTrivia(_);

      sep = p.eatMatch('|', PN, { path: 'seperatorTokens[]' });

      p.eatMatchTrivia(_);
    } while (sep);
    p.eat(']', PN, { path: 'closeToken', balancer: true });
  }

  // @Cover
  StringMatcher(p) {
    if (p.match(/['"]/y)) {
      p.eatProduction('JSON:String');
    } else {
      p.eatProduction('Regex:Pattern');
    }
  }
};
