const { buildCovers } = require('../utils.js');
const sym = require('../symbols.js');

const name = 'String';

const dependencies = {};

const covers = buildCovers({
  [sym.node]: ['String', 'StringContent'],
});

const PN = 'Punctuator';

const grammar = class StringMiniparserGrammar {
  // @Node
  String(p) {
    const q = p.match(/['"]/y) || '"';

    const span = q === '"' ? 'String:Double' : 'String:Single';

    p.eat(q, PN, { path: 'open', startSpan: span, balanced: q });
    if (p.match(/./sy) || p.atExpression) {
      p.eatProduction('StringContent', { path: 'content' });
    }
    p.eat(q, PN, { path: 'close', endSpan: span, balancer: true });
  }

  // @Node
  StringContent(p) {
    let esc, lit;
    do {
      esc =
        p.span.type === 'String:Single'
          ? p.eatMatchEscape(/\\[\\/nrt0']/y)
          : p.eatMatchEscape(/\\[\\/nrt0"]/y);
      lit =
        p.span.type === 'String:Single'
          ? p.eatMatchStr(/[^\r\n\\']+/y)
          : p.eatMatchStr(/[^\r\n\\"]+/y);
    } while (esc || lit);
  }
};

module.exports = { name, dependencies, covers, grammar };
