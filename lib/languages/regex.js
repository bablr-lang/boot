const objectEntries = require('iter-tools-es/methods/object-entries');
const { buildCovers } = require('../utils.js');
const { node } = require('../symbols.js');

const name = 'Regex';

const dependencies = new Map();

const covers = buildCovers({
  [node]: [
    'RegExpLiteral',
    'Flag',
    'Pattern',
    'Alternative',
    'Group',
    'CapturingGroup',
    'Assertion',
    'Character',
    'CharacterClass',
    'CharacterClassRange',
    'CharacterSet',
    'Quantifier',
    'Punctuator',
    'Keyword',
    'Escape',
    'DecimalInteger',
  ],
  CharacterClassElement: ['CharacterClassRange', 'Character'],
});

const escapables = new Map(
  objectEntries({
    n: '\n'.codePointAt(0),
    r: '\r'.codePointAt(0),
    t: '\t'.codePointAt(0),
    0: '\0'.codePointAt(0),
  }),
);

const flags = {
  global: 'g',
  ignoreCase: 'i',
  multiline: 'm',
  dotAll: 's',
  unicode: 'u',
  sticky: 'y',
};
const flagsReverse = Object.fromEntries(Object.entries(flags).map(([key, value]) => [value, key]));

const PN = 'Punctuator';
const KW = 'Keyword';
const ESC = 'Escape';

const unique = (flags) => flags.length === new Set(flags).size;

const specialPatterns = {
  Expression: /[*+{}[\]()\.^$|\\\n]/y,
  CharacterClass: /[\]\\\.]/y,
  'CharacterClass:NoRange': /[\]\-\\\.]/y,
  'CharacterClass:NoNegate': /[\]^\\\.]/y,
};

const cookCharacterEscape = (escape, span) => {
  let hexMatch;

  if (!escape.startsWith('\\')) {
    throw new Error('regex escape must start with \\');
  }

  if ((hexMatch = /\\x([0-9a-f]{2})/iy.exec(escape))) {
    //continue
  } else if ((hexMatch = /\\u([0-9a-f]{4})/iy.exec(escape))) {
    //continue
  } else if ((hexMatch = /\\u{([0-9a-f]+)}/iy.exec(escape))) {
    //continue
  }

  if (hexMatch) {
    return parseInt(hexMatch[1], 16);
  }

  let litMatch = /\\([nrt0])/y.exec(escape);

  if (litMatch) {
    return escapables.get(litMatch[1]);
  }

  if (!escape.startsWith('\\')) {
    throw new Error('regex escape must start with \\');
  }

  const specialPattern = specialPatterns[span.type];

  specialPattern.lastIndex = 0;

  let specialMatch = specialPattern.exec(escape.slice(1));

  if (specialMatch) {
    return specialMatch[0];
  }

  throw new Error('unable to cook escape');
};

const grammar = class RegexMiniparserGrammar {
  // @Node
  Pattern(p) {
    p.eat('/', PN, { path: 'open', startSpan: 'Expression', balanced: '/' });
    p.eatProduction('Alternatives', { path: '[alternatives]' });
    p.eat('/', PN, { path: 'close', endSpan: 'Expression', balancer: true });
    p.eatProduction('Flags', { path: '[flags]' });
  }

  Flags(p, attrs) {
    const flags = p.match(/[gimsuy]+/y) || '';

    if (!unique(flags)) throw new Error('flags must be unique');

    for (const _ of flags) {
      p.eatProduction('Flag', attrs);
    }
  }

  // @Node
  Flag(p) {
    const flag = p.eatMatch(/[gimsuy]/y, KW, { path: 'value' });

    return { attrs: { kind: flagsReverse[flag] } };
  }

  Alternatives(p, attrs) {
    do {
      p.eatProduction('Alternative', attrs);
    } while (p.eatMatch('|', PN, { path: '[separators]' }));
  }

  // @Node
  Alternative(p) {
    p.eatProduction('Elements', { path: '[elements]' });
  }

  Elements(p, attrs) {
    while (!p.done && p.chr !== '|') {
      p.eatProduction('Element', attrs);
    }
  }

  // @Cover
  Element(p, attrs) {
    let el;
    if (p.match('[')) {
      el = p.eatProduction('CharacterClass', attrs);
    } else if (p.match('(?:')) {
      el = p.eatProduction('Group', attrs);
    } else if (p.match(/\(\?<?[=!]/y)) {
      throw new Error('Lookeahead and lookbehind are not supported');
    } else if (p.match('(')) {
      el = p.eatProduction('CapturingGroup', attrs);
    } else if (p.match(/[$^]|\\b|/iy)) {
      el = p.eatProduction('Assertion', attrs);
    } else if (p.match(/\.|\\[dswp]/iy)) {
      el = p.eatProduction('CharacterSet', attrs);
    } else {
      el = p.eatProduction('Character', attrs);
    }

    if (p.match(/[*+?]|{\d+,?\d*}/y)) {
      p.shiftProduction('Quantifier', attrs);
    }
  }

  // @Node
  Group(p) {
    p.eat('(?:', PN, { path: 'open', startSpan: 'Expression', balanced: ')' });
    p.eatProduction('Alternatives', { path: '[alternatives]' });
    p.eat(')', PN, { path: 'close', endSpan: 'Expression', balancer: true });
  }

  // @Node
  CapturingGroup(p) {
    p.eat('(', PN, { path: 'open', startSpan: 'Expression', balanced: ')' });
    p.eatProduction('Alternatives', { path: '[alternatives]' });
    p.eat(')', PN, { path: 'close', endSpan: 'Expression', balancer: true });
  }

  // @Node
  Assertion(p) {
    let attrs = {};
    if (p.eatMatch('^', PN, { path: 'value' })) {
      attrs = { kind: 'start' };
    } else if (p.eatMatch('$', KW, { path: 'value' })) {
      attrs = { kind: 'end' };
    } else {
      if (p.eatMatch('\\', ESC, { path: 'escape' })) {
        const m = p.eat(/b/iy, KW, { path: 'value' });
        attrs = { kind: 'word', negate: m === 'B' };
      } else {
        throw new Error('invalid boundary');
      }
    }
    return { attrs };
  }

  // @Node
  Character(p) {
    const specialPattern = specialPatterns[p.span.type];

    if (
      p.eatMatchEscape(
        new RegExp(
          String.raw`\\(u(\{\d{1,6}\}|\d{4})|x[0-9a-fA-F]{2}|[nrt0]|${specialPattern.source})`,
          'y',
        ),
        cookCharacterEscape,
      )
    ) {
      // done
    } else if (p.match(specialPattern)) {
      throw new Error('invalid character');
    } else {
      p.eatStr(/./sy);
    }
  }

  // @Node
  CharacterClass(p) {
    p.eat('[', PN, { path: 'open', startSpan: 'CharacterClass', balanced: ']' });

    p.replaceSpan({ type: 'CharacterClass:NoNegate', guard: p.span.guard });

    p.eatMatch('^', KW, { path: 'negate', boolean: true });

    while (!p.done) {
      p.eatProduction('CharacterClassElement', { path: '[elements]' });
    }

    p.replaceSpan({ type: 'CharacterClass', guard: p.span.guard });
    p.eat(']', PN, { path: 'close', endSpan: 'CharacterClass', balancer: true });
  }

  // @Cover
  CharacterClassElement(p, attrs) {
    if (p.match(/.-[^\]\n]/y)) {
      p.eatProduction('CharacterClassRange', attrs);
    } else if (p.match(/\.|\\[dswp]/iy)) {
      p.eatProduction('CharacterSet', attrs);
    } else {
      p.eatProduction('Character', attrs);
    }
  }

  // @Node
  CharacterClassRange(p) {
    p.eatProduction('Character', { path: 'min' });
    p.replaceSpan({ type: 'CharacterClass', guard: p.span.guard });
    p.eat('-', PN, { path: 'rangeOperator' });
    p.eatProduction('Character', { path: 'max' });
    p.replaceSpan({ type: 'CharacterClass:NoRange', guard: p.span.guard });
  }

  // @Node
  CharacterSet(p) {
    if (p.eatMatch('.', KW, { path: 'value' })) {
      return { attrs: { kind: 'any' } };
    }

    p.eat('\\', PN, { path: 'escape' });

    let attrs;

    if (p.eatMatch('d', KW, { path: 'value' })) {
      attrs = { kind: 'digit' };
    } else if (p.eatMatch('D', KW, { path: 'value' })) {
      attrs = { kind: 'digit', negate: true };
    } else if (p.eatMatch('s', KW, { path: 'value' })) {
      attrs = { kind: 'space' };
    } else if (p.eatMatch('S', KW, { path: 'value' })) {
      attrs = { kind: 'space', negate: true };
    } else if (p.eatMatch('w', KW, { path: 'value' })) {
      attrs = { kind: 'word' };
    } else if (p.eatMatch('W', KW, { path: 'value' })) {
      attrs = { kind: 'word', negate: true };
    } else if (p.match(/p/iy)) {
      throw new Error('unicode property character sets are not supported yet');
    } else {
      throw new Error('unknown character set kind');
    }

    return { attrs };
  }

  // @Node
  Quantifier(p) {
    p.eatHeldProduction('Element', { path: 'element' });

    let attrs;

    if (p.eatMatch('*', KW, { path: 'value' })) {
      attrs = { min: 0, max: Infinity };
    } else if (p.eatMatch('+', KW, { path: 'value' })) {
      attrs = { min: 1, max: Infinity };
    } else if (p.eatMatch('?', KW, { path: 'value' })) {
      attrs = { min: 0, max: 1 };
    } else if (p.match('{')) {
      p.eat('{', PN, { path: 'open', balanced: '}' });

      let max;
      let min = p.eat(/\d+/y, 'DecimalInteger', { path: 'min' });

      if (p.eatMatch(',', PN, { path: 'separator' })) {
        max = p.eatMatch(/\d+/y, 'DecimalInteger', { path: 'max' });
      }

      attrs = { min, max };

      p.eat('}', PN, { path: 'close', balancer: true });
    }

    return { attrs };
  }
};

module.exports = { name, dependencies, covers, grammar };
