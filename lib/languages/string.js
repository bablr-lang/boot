const { buildCovers } = require('../utils.js');
const sym = require('../symbols.js');

const name = 'String';

const dependencies = {};

const covers = buildCovers({
  [sym.node]: ['String', 'StringFragment'],
});

const PN = 'Punctuator';

const grammar = class StringMiniparserGrammar {
  // @Node
  String(p) {
    const q = p.match(/['"]/y) || '"';

    const span = q === '"' ? 'String:Double' : 'String:Single';

    p.eat(q, PN, { path: 'open', startSpan: span, balanced: q });
    while (p.match(/./sy) || p.atExpression) {
      p.eatProduction('StringFragment', { path: '[fragments]' });
    }
    p.eat(q, PN, { path: 'close', endSpan: span, balancer: true });
  }

  // @Node
  StringFragment(p) {
    let esc, lit;
    do {
      esc =
        p.span.type === 'String:Single'
          ? p.eatMatchEscape(/\\[\\/nrt0']/y)
          : p.eatMatchEscape(/\\[\\/nrt0"]/y);
      lit =
        p.span.type === 'String:Single'
          ? p.eatMatchLiteral(/[^\r\n\\']+/y)
          : p.eatMatchLiteral(/[^\r\n\\"]+/y);
    } while (esc || lit);
  }
};

module.exports = { name, dependencies, covers, grammar };
