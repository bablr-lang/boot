const spamex = require('./spamex.js');
const { node } = require('../symbols.js');
const { buildCovers } = require('../utils.js');

const _ = /\s+/y;

const name = 'Instruction';

const dependencies = new Map([['Spamex', spamex]]);

const covers = buildCovers({
  [node]: ['Call'],
});

const grammar = class InstructionMiniparserGrammar {
  // @Node
  Call(p) {
    const verb = p.eat(/\w+/y, { path: 'verb' });
    p.eatMatch(_);
    p.eat('(');
    p.eatMatch(_);
    const argument = p.match(')')
      ? null
      : p.eatProduction('Spamex:Expression', { path: 'argument' });
    p.eatMatch(_);
    p.eat(')');

    return { verb, argument };
  }
};

module.exports = { name, dependencies, covers, grammar };
