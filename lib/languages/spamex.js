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
      'TreeNodeMatcher',
      'GapNodeMatcher',
      'NullNodeMatcher',
      'ReferenceMatcher',
      'BoundNodeMatcher',
      'BindingMatcher',
      'TreeNodeMatcherOpen',
      'TreeNodeMatcherClose',
      'Literal',
      'CSTML:NodeFlags',
    ]),
  ],
  ['AttributeValue', new Set(['JSON:String', 'CSTML:Number'])],
  ['Matcher', new Set(['BoundNodeMatcher'])],
  ['NodeMatcher', new Set(['TreeNodeMatcher', 'GapNodeMatcher', 'NullNodeMatcher'])],
  ['StringMatcher', new Set(['JSON:String', 'Regex:Pattern'])],
]);

export const grammar = class SpamexMiniparserGrammar {
  Matcher(p) {
    p.eatProduction('BoundNodeMatcher');
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

    p.eatProduction('BoundNodeMatcher', { path: 'valueMatcher' });
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

  BoundNodeMatcher(p) {
    while (p.match(':')) {
      p.eatProduction('BindingMatcher', { path: 'bindingMatchers[]' });
      p.eatMatchTrivia(_);
    }

    p.eatProduction('NodeMatcher', { path: 'nodeMatcher', noInterpolate: true });
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
    let chrs = p.match(/<\/\/>|<\/>|<|null/y);
    switch (chrs) {
      case '<//>':
        p.eatProduction('GapNodeMatcher');
        break;
      case '</>':
        p.fail();
        break;
      case 'null':
        p.eatProduction('NullNodeMatcher');
        break;
      default:
        p.eatProduction('TreeNodeMatcher', { noInterpolate: true });
        break;
    }
  }

  TreeNodeMatcher(p) {
    if (p.match(/[a-zA-Z.#@]/y) || p.atExpression) {
      p.eatProduction('PropertyMatcher', { path: 'children[]', noInterpolate: true });
      return;
    }

    let open = p.eatProduction('TreeNodeMatcherOpen', { path: 'open' });

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

      p.eatProduction('TreeNodeMatcherClose', { path: 'close' });
    }
  }

  TreeNodeMatcherOpen(p) {
    if (p.match(/['"/]/y)) {
      p.eatProduction('CSTML:NodeFlags', { path: 'flags', token: true });
      p.eatProduction('StringMatcher', { path: 'literalValue' });

      return { attrs: { selfClosing: true } };
    }

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
    let sc = p.eatMatch('/', PN, { path: 'selfClosingToken' });
    p.eat('>', PN, { path: 'closeToken' });

    return { attrs: { selfClosing: !!sc } };
  }

  TreeNodeMatcherClose(p) {
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
