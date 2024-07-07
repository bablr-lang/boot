const Spamex = require('./spamex.js');
const CSTML = require('./cstml.js');
const Regex = require('./regex.js');
const { node } = require('../symbols.js');
const { buildCovers } = require('../utils.js');

const _ = /\s+/y;
const PN = 'Punctuator';
const ID = 'Identifier';
const KW = 'Keyword';
const LIT = 'Literal';

const name = 'Instruction';

const canonicalURL = 'https://bablr.org/languages/core/bablr-vm-instruction';

const dependencies = { Spamex, CSTML, Regex };

const covers = buildCovers({
  [node]: ['Call', 'Punctuator', 'Property', 'Expression'],
  Expression: [
    'Object',
    'Array',
    'Tuple',
    'Identifier',
    'CSTML:String',
    'CSTML:Gap',
    'Regex:Pattern',
    'Boolean',
    'Null',
    'Spamex:Matcher',
  ],
});

const grammar = class InstructionMiniparserGrammar {
  // @Node
  Call(p) {
    p.eat(/[a-zA-Z]+/y, ID, { path: 'verb' });
    p.eatMatchTrivia(_);
    p.eatProduction('Tuple', { path: 'arguments' });
  }

  // @Cover
  Expression(p) {
    if (p.match('[')) {
      p.eatProduction('Array');
    } else if (p.match('{')) {
      p.eatProduction('Object');
    } else if (p.match('(')) {
      p.eatProduction('Tuple');
    } else if (p.match(/['"]/y)) {
      p.eatProduction('CSTML:String');
    } else if (p.match('<//>')) {
      p.eatProduction('CSTML:Gap');
    } else if (p.match('/')) {
      p.eatProduction('Regex:Pattern');
    } else if (p.match(/true|false/y)) {
      p.eatProduction('Boolean');
    } else if (p.match('null')) {
      p.eatProduction('Null');
    } else if (p.match(/[a-zA-Z]/y)) {
      p.eat(/[a-zA-Z]+/y, ID, p.m.attributes);
    } else if (p.match('<')) {
      p.eatProduction('Spamex:Matcher');
    }
  }

  // @Node
  Object(p) {
    p.eat('{', PN, { path: 'openToken', balanced: '}' });

    p.eatMatchTrivia(_);

    let first = true;
    let sep;
    while (first || (sep && (p.match(/./y) || p.atExpression))) {
      p.eatProduction('Property', { path: 'properties[]' });
      sep = p.eatMatchTrivia(_);
      first = false;
    }

    p.eatMatchTrivia(_);

    p.eat('}', PN, { path: 'closeToken', balancer: true });
  }

  // @Node
  Property(p) {
    p.eat(/[a-zA-Z]+/y, LIT, { path: 'key' });
    p.eatMatchTrivia(_);
    p.eat(':', PN, { path: 'mapToken' });
    p.eatMatchTrivia(_);
    p.eatProduction('Expression', { path: 'value' });
  }

  // @Node
  Array(p) {
    p.eat('[', PN, { path: 'openToken', balanced: ']' });

    p.eatMatchTrivia(_);

    let first = true;
    let sep;
    while (first || (sep && (p.match(/./y) || p.atExpression))) {
      p.eatProduction('Expression', { path: 'elements[]' });
      sep = p.eatMatchTrivia(_);
      first = false;
    }

    p.eat(']', PN, { path: 'closeToken', balancer: true });
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

  // @Node
  Boolean(p) {
    p.eat(/true|false/y, KW, { path: 'sigilToken' });
  }

  // @Node
  Null(p) {
    p.eat('null', KW, { path: 'sigilToken' });
  }
};

module.exports = { name, canonicalURL, dependencies, covers, grammar };
