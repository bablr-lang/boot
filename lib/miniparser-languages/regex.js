const objectEntries = require('iter-tools-es/methods/object-entries');
const str = require('iter-tools-es/methods/str');
const { buildCovers } = require('../utils.js');
const { node } = require('../symbols.js');

const name = 'Regex';

const dependencies = new Map();

const covers = buildCovers({
  [node]: [
    'RegExpLiteral',
    'Flags',
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
  ],
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

// export const escapeCharacterClass = (str) => str.replace(/]\\-/g, (r) => `\\${r}`);

const unique = (flags) => flags.length === new Set(flags).size;

const specialPatterns = {
  Expression: /[*+{}[\]()\.^$|\\\n]/y,
  CharacterClass: /[\]\\\.]/y,
  'CharacterClass:NoRange': /[\]\-\\\.]/y,
  'CharacterClass:NoNegate': /[\]^\\\.]/y,
};

const grammar = class RegexMiniparserGrammar {
  // @Node
  Pattern(p) {
    p.eat('/', { startSpan: 'Expression', balanced: '/' });
    p.eatProduction('Alternatives');
    p.eat('/', { endSpan: 'Expression' });
    p.eatProduction('Flags');
  }

  Flags(p) {
    const flags = p.eatMatch(/[gimsuy]+/y) || '';

    if (!unique(flags)) throw new Error('flags must be unique');

    for (const flag of flags) {
      p.eatProduction('Flag', { path: '[flags]', kind: flagsReverse[flag] });
    }
  }

  // @Node
  Flag(p, attrs) {
    // Problem: This production should be the one to define mapping from regex match to flag kind!
    if (!attrs.kind) throw new Error('Flag kind is required');

    p.eat(flags[attrs.kind]);
  }

  Alternatives(p) {
    do {
      p.eatProduction('Alternative', { path: '[alternatives]' });
    } while (p.eatMatch('|'));
  }

  // @Node
  Alternative(p) {
    p.eatProduction('Elements');
  }

  Elements(p) {
    do {
      p.eatProduction('Element', { path: '[elements]' });
    } while (p.eatMatch('|'));
  }

  // @Cover
  Element(p) {
    let el;
    if (p.match('[')) {
      el = p.eatProduction('CharacterClass');
    } else if (p.match('(?:')) {
      el = p.eatProduction('Group');
    } else if (p.match(/\(\?<?[=!]/y)) {
      throw new Error('Lookeahead and lookbehind are not supported');
    } else if (p.match('(')) {
      el = p.eatProduction('CapturingGroup');
    } else if (p.match(/[$^]|\\b|/iy)) {
      el = p.eatProduction('Assertion');
    } else if (p.match(/\.|\\[dswp]/iy)) {
      el = p.eatProduction('CharacterSet');
    } else {
      el = p.eatProduction('Character');
    }

    if (p.match(/[*+?]|{\d+,?\d*}/y)) {
      p.element = el; // not my best work
      return p.eatProduction('Quantifier');
    }
  }

  // @Node
  Group(p) {
    p.eat('(?:', { startSpan: 'Expression', balanced: ')' });
    p.eatProduction('Alternatives');
    p.eat(')', { endSpan: 'Expression' });
  }

  // @Node
  CapturingGroup(p) {
    p.eat('(', { startSpan: 'Expression', balanced: ')' });
    p.eatProduction('Alternatives');
    p.eat(')', { endSpan: 'Expression' });
  }

  // @Node
  Assertion(p) {
    if (p.eatMatch('^')) {
      return { kind: 'start' };
    } else if (p.eatMatch('$')) {
      return { kind: 'end' };
    } else {
      let m;
      if ((m = p.eatMatch(/\\b/iy))) {
        return { kind: 'word', negate: m[1] === 'B' };
      } else {
        throw new Error('invalid boundary');
      }
    }
  }

  // @Node
  Character(p) {
    const specialPattern = specialPatterns[p.span.type];
    const esc = p.eatMatch('\\');

    if (esc) {
      const escapeType =
        p.eatMatch(/[ux]/y) || p.eatMatch(new RegExp(`[${str(escapables.keys())}]`, 'y'));
      if (escapeType) {
        let code;
        if (escapeType === 'x') {
          code = p.eatMatch(/[0-9a-f]{2}/iy);
        } else if (escapeType === 'u') {
          if (p.eatMatch('{')) {
            code = p.eat(/\d{1,6}/y);
            p.eat('}');
          } else {
            code = p.eatMatch(/\d{4}/y);
          }
        } else {
          if (!(code = escapables.get(escapeType))) {
            throw new Error('unsupported escape type');
          }
        }
        if (!code) {
          throw new Error('Inavlid escape sequence');
        }
      } else {
        p.eat(specialPattern);
      }
    } else if (!p.match(specialPattern)) {
      p.eat(/./sy);
    } else {
      throw new Error('invalid character');
    }
  }

  // @Node
  CharacterClass(p) {
    p.eat('[', { startSpan: 'CharacterClass', balanced: ']' });

    p.replaceSpan({ type: 'CharacterClass:NoNegate', guard: p.span.guard });

    p.eatMatch('^', { path: 'negate', boolean: true });

    while (!p.done) {
      p.eatProduction('CharacterClassElement', { path: '[elements]' });
    }

    p.replaceSpan({ type: 'CharacterClass', guard: p.span.guard });
    p.eat(']', { endSpan: 'CharacterClass' });
  }

  CharacterClassElement(p) {
    if (p.match(/.-[^\]\n]/y)) {
      p.eatProduction('CharacterClassRange');
    } else {
      p.eatProduction('Character');
    }
  }

  // @Node
  CharacterClassRange(p) {
    p.eatProduction('Character', { path: 'min' });
    p.replaceSpan({ type: 'CharacterClass', guard: p.span.guard });
    p.eat('-');
    p.eatProduction('Character', { path: 'max' });
    p.replaceSpan({ type: 'CharacterClass:NoRange', guard: p.span.guard });
  }

  // @Node
  CharacterSet(p) {
    if (p.eatMatch('.')) {
      return { kind: 'any' };
    }

    p.eat('\\');

    let attrs;

    if (p.eatMatch('d')) {
      attrs = { kind: 'digit' };
    } else if (p.eatMatch('D')) {
      attrs = { kind: 'digit', negate: true };
    } else if (p.eatMatch('s')) {
      attrs = { kind: 'space' };
    } else if (p.eatMatch('S')) {
      attrs = { kind: 'space', negate: true };
    } else if (p.eatMatch('w')) {
      attrs = { kind: 'word' };
    } else if (p.eatMatch('W')) {
      attrs = { kind: 'word', negate: true };
    } else if (p.eatMatch(/p/iy)) {
      throw new Error('unicode property character sets are not supported yet');
    } else {
      throw new Error('unknown character set kind');
    }

    return { attrs };
  }

  // @Node
  Quantifier(p) {
    if (!p.element) {
      throw new Error('nothing to quantify');
    }

    let attrs;

    if (p.eatMatch('*')) {
      attrs = { min: 0, max: Infinity };
    } else if (p.eatMatch('+')) {
      attrs = { min: 1, max: Infinity };
    } else if (p.eatMatch('?')) {
      attrs = { min: 0, max: 1 };
    } else if (p.match()) {
      p.eat('{');

      let max;
      let min = p.eat(/\d+/y, { path: 'min' });

      if (p.eatMatch(',')) {
        max = p.eatMatch(/\d+/y, { path: 'max' });
      }

      attrs = { min, max };

      p.eat('}');
    }

    p.element = null;

    return { attrs };
  }
};

module.exports = { name, dependencies, covers, grammar };
