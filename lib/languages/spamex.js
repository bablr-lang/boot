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
      'Identifier',
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
      'Literal',
      'CSTML:NodeFlags',
    ]),
  ],
  ['AttributeValue', new Set(['JSON:String', 'CSTML:Number'])],
  ['Matcher', new Set(['PropertyMatcher', 'JSON:String', 'Regex:Pattern'])],
  [
    'NodeMatcher',
    new Set(['BasicNodeMatcher', 'GapNodeMatcher', 'ArrayNodeMatcher', 'NullNodeMatcher']),
  ],
  ['StringMatcher', new Set(['JSON:String', 'Regex:Pattern'])],
]);

export const grammar = class SpamexMiniparserGrammar {
  // @Cover
  Matcher(p) {
    if (p.match(/[a-zA-Z.#@<]/y)) {
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
    if (p.match(/[a-zA-Z.#@]/y)) {
      p.eatProduction('ReferenceMatcher', { path: 'refMatcher' });
    }

    p.eatMatchTrivia(_);

    p.eatProduction('NodeMatcher', { path: 'nodeMatcher' });
  }

  // @Node
  ReferenceMatcher(p) {
    let name;
    if ((name = p.match(/[.#@]/y))) {
      name = p.eat(name, PN, { path: 'name' });
    } else if (p.match(/[A-Za-z]/y)) {
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

    if (p.match(/['"]|[a-zA-Z]+:/y) || p.atExpression) {
      p.eatProduction('CSTML:TagType', { path: 'type', noInterpolate: true });
    } else if (p.match('?')) {
      p.eat('?', PN, { path: 'type' });
    } else if (p.match(' ')) {
      p.eatMatchTrivia(_);
    } else {
      if (p.atExpression) {
        p.eatProduction('Identifier', { path: 'type' });
      } else {
        p.eatMatch(/[a-zA-Z]+/y, ID, { path: 'type' });
      }
    }

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
  StringMatcher(p) {
    if (p.match(/['"]/y)) {
      p.eatProduction('JSON:String');
    } else {
      p.eatProduction('Regex:Pattern');
    }
  }

  // @Node
  Identifier(p) {
    p.eatLiteral(/[a-zA-Z]+/y);
  }
};
