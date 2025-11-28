import * as sym from '@bablr/agast-vm-helpers/symbols';
import Regex from './regex.js';
import CSTML from './cstml.js';
import JSON from './json.js';
import { get } from '@bablr/agast-helpers/path';

const _ = /\s+/y;
const PN = null;

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
      'NullNodeMatcher',
      'ReferenceMatcher',
      'BindingMatcher',
      'OpenNodeMatcher',
      'CloseNodeMatcher',
      'Literal',
      'CSTML:NodeFlags',
    ]),
  ],
  ['AttributeValue', new Set(['JSON:String', 'CSTML:Number'])],
  ['Matcher', new Set(['PropertyMatcher', 'JSON:String', 'Regex:Pattern'])],
  ['NodeMatcher', new Set(['BasicNodeMatcher', 'GapNodeMatcher', 'NullNodeMatcher'])],
  ['StringMatcher', new Set(['JSON:String', 'Regex:Pattern'])],
]);

export const grammar = class SpamexMiniparserGrammar {
  Matcher(p) {
    if (p.match(/[a-zA-Z.#@<:]/y) || p.atExpression) {
      p.eatProduction('PropertyMatcher');
    } else if (p.match(/['"/]/y)) {
      p.eatProduction('StringMatcher');
    } else {
      throw new Error(`Unexpected character ${p.chr}`);
    }
  }

  GapNodeMatcher(p) {
    p.eat('<//>', PN, { path: 'sigilToken' });
  }

  NullNodeMatcher(p) {
    p.eat('null', PN, { path: 'sigilToken' });
  }

  PropertyMatcher(p) {
    let hasRef = p.match(/[a-zA-Z.#@]/y) || p.atExpression || null;

    p.eatProduction(hasRef && 'ReferenceMatcher', { path: 'refMatcher' });

    p.eatMatchTrivia(_);

    while (p.match(':') || p.atExpression || null) {
      p.eatProduction('BindingMatcher', { path: 'bindingMatchers[]' });

      p.eatMatchTrivia(_);
    }

    p.eatProduction('NodeMatcher', { path: 'nodeMatcher' });
  }

  ReferenceMatcher(p) {
    let name, type;
    if ((type = p.match(/\.\.|[.#@]/y))) {
      p.eat(type, PN, { path: 'type' });
    }

    if ((!type || type === '#') && p.match(/[A-Za-z]/y)) {
      name = p.eatProduction('CSTML:Identifier', { path: 'name' });
    }

    let open = (name || type) && p.eatMatch('[', PN, { path: 'openIndexToken' });

    if (open) {
      p.eatMatchTrivia(_);
      p.eat(']', PN, { path: 'closeIndexToken' });
    }

    p.eatMatchTrivia(_);
    if (!['#', '@'].includes(type) /* p.match(/[+*$]/y) */) {
      p.eatProduction('CSTML:ReferenceFlags', { path: 'flags' });
      p.eatMatchTrivia(_);
    }
    p.eat(':', PN, { path: 'mapToken' });
  }

  BindingMatcher(p) {
    p.eat(':', PN, { path: 'openToken' });

    p.eatMatchTrivia(_);
    let first = true;
    while (!p.match(':') && (first || p.match('/'))) {
      if (!first) {
        p.eat('/', PN, { path: '#separatorTokens' });
      }
      p.eatProduction('CSTML:BindingSegment', { path: 'segments[]' });
      p.eatMatchTrivia(_);
      first = false;
    }
    p.eat(':', PN, { path: 'closeToken' });
  }

  NodeMatcher(p) {
    if (p.match('<//>')) {
      p.eatProduction('GapNodeMatcher');
    } else if (p.match('<')) {
      p.eatProduction('BasicNodeMatcher');
    } else if (p.match('null')) {
      p.eatProduction('NullNodeMatcher');
    } else {
      p.fail();
    }
  }

  BasicNodeMatcher(p) {
    let open = p.eatProduction('OpenNodeMatcher', { path: 'open' });

    if (!get('selfClosingToken', open)) {
      p.eatMatchTrivia(_);

      if (get('flags', open)?.token) {
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

  OpenNodeMatcher(p) {
    p.eat('<', PN, { path: 'openToken' });

    if (!p.atExpression) {
      p.eatProduction('CSTML:NodeFlags', { path: 'flags' });
    }

    if (p.match(/[a-zA-Z]/y) || p.atExpression) {
      p.eatProduction('CSTML:Identifier', { path: 'type' });
    } else if (p.match('?')) {
      p.eat('?', PN, { path: 'type' });
    } else if (p.match('_')) {
      p.eat('_', PN, { path: 'type' });
    }

    let sp = p.eatMatchTrivia(_);

    if (sp && ((p.match(/['"/]/y) && !p.match('/>')) || p.atExpression)) {
      p.eatProduction('StringMatcher', { path: 'literalValue' });

      sp = p.eatMatchTrivia(_);
    }

    if (p.match('{') || p.atExpression) {
      p.eatProduction('JSON:Object', { path: 'attributes' });
      p.eatMatchTrivia(_);
    }

    p.eatMatchTrivia(_);
    p.eatMatch('/', PN, { path: 'selfClosingToken' });
    p.eat('>', PN, { path: 'closeToken' });
  }

  CloseNodeMatcher(p) {
    p.eat('</', PN, { path: 'openToken' });
    p.eat('>', PN, { path: 'closeToken' });
  }

  StringMatcher(p) {
    if (p.match(/['"]/y)) {
      p.eatProduction('JSON:String');
    } else {
      p.eatProduction('Regex:Pattern');
    }
  }
};

export default { name, canonicalURL, dependencies, covers, grammar };
