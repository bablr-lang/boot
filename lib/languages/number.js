const { buildCovers } = require('../utils.js');
const sym = require('../symbols.js');

const name = 'Number';

const dependencies = {};

const covers = buildCovers({
  [sym.node]: ['Number', 'Digit'],
  Number: ['LiteralNumber', 'SymbolicNumber'],
});

const grammar = class NumberMiniparserGrammar {
  // @Node
  LiteralNumber(p) {
    p.eatMatch('-', 'Punctuator', { path: 'negative' });
    p.eatProduction('Digits', { path: 'digits[]' });
  }

  // @Node
  SymbolicNumber(p) {
    p.eatMatch('-', 'Punctuator', { path: 'negative' });
    p.eat('Infinity', 'Keyword', { path: 'value' });
  }

  Digits(p) {
    while (p.match(/\d/y)) {
      p.eatProduction('Digit');
    }
  }

  // @Node
  Digit(p) {
    p.eatLiteral(/\d/y);
  }
};

module.exports = { name, dependencies, covers, grammar };
