const Spamex = require('./spamex.js');
const { node } = require('../symbols.js');
const { buildCovers } = require('../utils.js');

const _ = /\s+/y;
const PN = 'Punctuator';
const ID = 'Identifier';

const name = 'Instruction';

const dependencies = { Spamex };

const covers = buildCovers({
  [node]: ['Call', 'Identifier', 'Punctuator'],
});

const grammar = class InstructionMiniparserGrammar {
  // @Node
  Call(p) {
    p.eat(/\w+/y, ID, { path: 'verb' });
    p.eatMatchTrivia(_);
    p.eat('(', PN, { path: 'open', balanced: '(' });
    p.eatMatchTrivia(_);
    p.match(')') ? null : p.eatProduction('Spamex:Matcher', { path: 'argument' });
    p.eatMatchTrivia(_);
    p.eat(')', PN, { path: 'close', balancer: true });
  }
};

module.exports = { name, dependencies, covers, grammar };
