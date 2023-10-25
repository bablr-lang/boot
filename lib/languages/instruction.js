const Spamex = require('./spamex.js');
const { node } = require('../symbols.js');
const { buildCovers } = require('../utils.js');

const _ = /\s+/y;
const PN = 'Punctuator';
const ID = 'Identifier';

const name = 'Instruction';

const dependencies = { Spamex };

const covers = buildCovers({
  [node]: ['Call', 'Punctuator', 'Identifier'],
});

const grammar = class InstructionMiniparserGrammar {
  // @Node
  Call(p) {
    p.eat(/\w+/y, ID, { path: 'verb' });
    p.eatMatchTrivia(_);
    p.eat('(', PN, { path: 'open', balanced: '(' });
    p.eatMatchTrivia(_);
    p.eatProduction('Arguments');
    p.eatMatchTrivia(_);
    p.eat(')', PN, { path: 'close', balancer: true });
  }

  Arguments(p) {
    let first = true;
    while ((first || p.match(/\s*,/y)) && (p.match(/./sy) || p.atExpression)) {
      if (!first) {
        p.eatMatchTrivia(_);
        p.eat(',', PN, { path: '[separators]' });
        p.eatMatchTrivia(_);
      }
      p.eatProduction('Spamex:Expression', { path: '[arguments]' });
      first = false;
    }
  }
};

module.exports = { name, dependencies, covers, grammar };
