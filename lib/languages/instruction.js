import * as sym from '@bablr/agast-vm-helpers/symbols';
import Spamex from './spamex.js';
import CSTML from './cstml.js';
import Regex from './regex.js';
import BaseJSON from './json.js';

const _ = /\s+/y;
const PN = null;
const ID = 'Identifier';
const KW = 'Keyword';

export const name = 'Instruction';

export const canonicalURL = 'https://bablr.org/languages/core/en/bablr-vm-instruction';

class JSONGrammar extends BaseJSON.grammar {
  Expression(p) {
    if (p.match(/(m|re|t)['"`]/y)) {
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
  [sym.node, new Set(['Call'])],
  [
    'Expression',
    new Set([
      'Object',
      'Array',
      'Number',
      'JSON:String',
      'CSTML:GapTag',
      'RegexString',
      'SpamexString',
      'TagString',
      'NodeString',
      'Boolean',
      'Null',
    ]),
  ],
]);

export const grammar = class InstructionMiniparserGrammar {
  Call(p) {
    p.eat(/[a-zA-Z]+/y, ID, { path: 'verb' });
    p.eatMatchTrivia(_);

    p.eat('(', PN, { path: 'openToken' });

    let sep = p.eatMatchTrivia(_);

    let i = 0;
    while (i === 0 || (sep && (p.match(/./y) || p.atExpression))) {
      p.eatProduction('Expression', { path: 'values[]' });
      sep = p.eatMatchTrivia(_);
      i++;
    }

    p.eat(')', PN, { path: 'closeToken' });
  }

  SpamexString(p) {
    p.eat('m', KW, { path: 'sigilToken' });
    let quot = p.match(/['"`]/);
    p.eat(quot, PN, { path: 'openToken' });
    p.eatProduction('Spamex:Matcher', { path: 'content' });

    p.eat(quot, PN, { path: 'closeToken' });
  }

  TagString(p) {
    p.eat('t', KW, { path: 'sigilToken' });
    let quot = p.match(/['"`]/);
    p.eat(quot, PN, { path: 'openToken' });
    p.eatProduction('CSTML:Tag', { path: 'content' });

    p.eat(quot, PN, { path: 'closeToken' });
  }

  NodeString(p) {
    p.eat('n', KW, { path: 'sigilToken' });
    let quot = p.match(/['"`]/);
    p.eat(quot, PN, { path: 'openToken' });
    p.eatProduction('CSTML:Node', { path: 'content' });

    p.eat(quot, PN, { path: 'closeToken' });
  }

  RegexString(p) {
    p.eat('re', KW, { path: 'sigilToken' });
    let quot = p.match(/['"`]/);
    p.eat(quot, PN, { path: 'openToken' });
    p.eatProduction('Regex:Pattern', { path: 'content' });

    p.eat(quot, PN, { path: 'closeToken' });
  }

  Expression(p) {
    if (p.match('[')) {
      p.eatProduction('JSON:Array');
    } else if (p.match('{')) {
      p.eatProduction('JSON:Object');
    } else if (p.match(/['"]/y)) {
      p.eatProduction('JSON:String');
    } else if (p.match(/re['"`]/y)) {
      p.eatProduction('RegexString');
    } else if (p.match(/m['"`]/y)) {
      p.eatProduction('SpamexString');
    } else if (p.match(/t['"`]/y)) {
      p.eatProduction('TagString');
    } else if (p.match(/n['"`]/y)) {
      p.eatProduction('NodeString');
    } else if (p.match(/true|false/y)) {
      p.eatProduction('JSON:Boolean');
    } else if (p.match('null')) {
      p.eatProduction('JSON:Null');
    }
  }
};

export default { name, canonicalURL, dependencies, covers, grammar };
