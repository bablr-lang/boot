const objectEntries = require('iter-tools-es/methods/object-entries');
const { buildCovers } = require('../utils.js');
const sym = require('../symbols.js');

const name = 'String';

const dependencies = {};

const covers = buildCovers({
  [sym.node]: ['String', 'Content'],
});

const PN = 'Punctuator';

const escapables = new Map(
  objectEntries({
    n: '\n',
    r: '\r',
    t: '\t',
    0: '\0',
  }),
);

const cookEscape = (escape, span) => {
  let hexMatch;

  if (!escape.startsWith('\\')) {
    throw new Error('string escape must start with \\');
  }

  if ((hexMatch = /\\x([0-9a-f]{2})/iy.exec(escape))) {
    //continue
  } else if ((hexMatch = /\\u([0-9a-f]{4})/iy.exec(escape))) {
    //continue
  } else if ((hexMatch = /\\u{([0-9a-f]+)}/iy.exec(escape))) {
    //continue
  }

  if (hexMatch) {
    return String.fromCodePoint(parseInt(hexMatch[1], 16));
  }

  const litPattern = span === 'Single' ? /\\([\\nrt0'])/y : /\\([\\nrt0"])/y;
  const litMatch = litPattern.exec(escape);

  if (litMatch) {
    return escapables.get(litMatch[1]) || litMatch[1];
  }

  throw new Error('unable to cook string escape');
};

const grammar = class StringMiniparserGrammar {
  // @Node
  String(p) {
    const q = p.match(/['"]/y) || '"';

    const span = q === '"' ? 'Double' : 'Single';

    p.eat(q, PN, { path: 'open', startSpan: span, balanced: q });
    while (p.match(/./sy) || p.atExpression) {
      p.eatProduction('Content', { path: 'content' });
    }
    p.eat(q, PN, { path: 'close', endSpan: span, balancer: true });
  }

  // @Node
  Content(p) {
    let esc, lit;
    let i = 0;
    do {
      esc =
        p.span.type === 'Single'
          ? p.eatMatchEscape(/\\(u(\{\d{1,6}\}|\d{4})|x[0-9a-fA-F]{2}|[\\nrt0'])/y)
          : p.eatMatchEscape(/\\(u(\{\d{1,6}\}|\d{4})|x[0-9a-fA-F]{2}|[\\nrt0"])/y);
      lit =
        p.span.type === 'Single'
          ? p.eatMatchLiteral(/[^\r\n\0\\']+/y)
          : p.eatMatchLiteral(/[^\r\n\0\\"]+/y);
      i++;
    } while (esc || lit);
    if (i === 1 && !esc && !lit) {
      throw new Error('Invalid string content');
    }
  }
};

module.exports = { name, dependencies, covers, grammar, escapables, cookEscape };
