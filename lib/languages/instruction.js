import * as sym from '@bablr/agast-helpers/symbols';
import * as Spamex from './spamex.js';
import * as CSTML from './cstml.js';
import * as Regex from './regex.js';
import * as BaseJSON from './json.js';

const _ = /\s+/y;
const PN = 'Punctuator';
const ID = 'Identifier';

export const name = 'Instruction';

export const canonicalURL = 'https://bablr.org/languages/core/en/bablr-vm-instruction';

class JSONGrammar extends BaseJSON.grammar {
  Expression(p) {
    if (p.match('<')) {
      grammar.prototype.Expression.call(this, p);
    } else {
      super.Expression(p);
    }
  }
}

const JSON = {
  ...BaseJSON,
  grammar: JSONGrammar,
};

export const dependencies = { Spamex, CSTML, Regex, JSON };

export const covers = new Map([
  [sym.node, new Set(['Call', 'Punctuator', 'Tuple'])],
  [
    'Expression',
    new Set([
      'Object',
      'Array',
      'Number',
      'String',
      'CSTML:GapTag',
      'Regex:Pattern',
      'Boolean',
      'Null',
      'Spamex:PropertyMatcher',
    ]),
  ],
]);

export const grammar = class InstructionMiniparserGrammar {
  // @Node
  Call(p) {
    p.eat(/[a-zA-Z]+/y, ID, { path: 'verb' });
    p.eatMatchTrivia(_);
    p.eatProduction('Tuple', { path: 'arguments' });
  }

  // @Cover
  Expression(p) {
    if (p.match('[')) {
      p.eatProduction('JSON:Array');
    } else if (p.match('{')) {
      p.eatProduction('JSON:Object');
    } else if (p.match(/['"]/y)) {
      p.eatProduction('Spamex:StringMatcher');
    } else if (p.match('/')) {
      p.eatProduction('Regex:Pattern');
    } else if (p.match(/<|([a-zA-Z]+|[.#@])\s*[+$[\]]*\s*:/y)) {
      p.eatProduction('Spamex:PropertyMatcher');
    } else if (p.match(/true|false/y)) {
      p.eatProduction('JSON:Boolean');
    } else if (p.match('null')) {
      p.eatProduction('JSON:Null');
    }
  }

  // @Node
  Tuple(p) {
    p.eat('(', PN, { path: 'openToken', balanced: ')' });

    let sep = p.eatMatchTrivia(_);

    let i = 0;
    while (i === 0 || (sep && (p.match(/./y) || p.atExpression))) {
      p.eatProduction('Expression', { path: 'values[]' });
      sep = p.eatMatchTrivia(_);
      i++;
    }

    p.eat(')', PN, { path: 'closeToken', balancer: true });
  }
};
