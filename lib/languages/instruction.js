const spamex = require('./spamex.js');
const { node } = require('../symbols.js');
const { buildCovers } = require('../utils.js');

const _ = /\s+/y;

const name = 'Instruction';

const dependencies = new Map([['Spamex', spamex]]);

const covers = buildCovers({
  [node]: ['Call', 'Identifier'],
});

const grammar = class InstructionMiniparserGrammar {
  // @Node
  Call(p) {
    p.eat(/\w+/y, 'Identifier', { path: 'verb' });
    p.eatMatch(_, 'Trivia');
    p.eat('(', 'Punctuator');
    p.eatMatch(_, 'Trivia');
    p.match(')') ? null : p.eatProduction('Spamex:Expression', { path: 'argument' });
    p.eatMatch(_, 'Trivia');
    p.eat(')', 'Punctuator');
  }
};

module.exports = { name, dependencies, covers, grammar };
