const spamex = require('./spamex.js');
const { buildCovers } = require('@bablr/grammar');

const _ = /\s+/y;

const node = Symbol.for('@bablr/node');

const name = 'Instruction';

const dependencies = new Map([['Spamex', spamex]]);

const covers = buildCovers({
  [node]: ['Call'],
});

const grammar = class InstructionMiniparserGrammar {
  // @Node
  Call(p) {
    const callee = p.eatProduction('Identifier');
    p.eatMatch(_);
    p.eat('(');
    p.eatMatch(_);
    const argument = p.match(')') ? null : p.eatProduction('Spamex:Expression');
    p.eatMatch(_);
    p.eat(')');

    return { callee, argument };
  }
};

module.exports = { name, dependencies, covers, grammar };
