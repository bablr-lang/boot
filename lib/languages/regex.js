const when = require('iter-tools/methods/when');
const { escapables } = require('./cstml.js');
const { buildCovers } = require('../utils.js');
const { node } = require('@bablr/boot-helpers/symbols');

const name = 'Regex';

const canonicalURL = 'https://bablr.org/languages/core/en/bablr-regex-pattern';

const dependencies = {};

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
    'AnyCharacterSet',
    'WordCharacterSet',
    'SpaceCharacterSet',
    'DigitCharacterSet',
    'Quantifier',
    'Punctuator',
    'Keyword',
    'Escape',
    'Number',
    'Gap',
  ],
  Assertion: ['StartOfInputAssertion', 'EndOfInputAssertion', 'WordBoundaryAssertion'],
  Element: [
    'CharacterClass',
    'Group',
    'CapturingGroup',
    'Assertion',
    'CharacterSet',
    'Gap',
    'Character',
    'Quantifier',
  ],
  CharacterClassElement: ['CharacterClassRange', 'CharacterSet', 'Character', 'Gap'],
  CharacterSet: ['AnyCharacterSet', 'WordCharacterSet', 'SpaceCharacterSet', 'DigitCharacterSet'],
});

const flags = {
  global: 'g',
  ignoreCase: 'i',
  multiline: 'm',
  dotAll: 's',
  unicode: 'u',
  sticky: 'y',
};

const PN = 'Punctuator';
const KW = 'Keyword';
const ESC = 'Escape';

const unique = (flags) => flags.length === new Set(flags).size;

const getSpecialPattern = (span) => {
  const { type } = span;
  if (type === 'Bare') {
    return /[*+{}\[\]()\.^$|\\\n\/><]/y;
  } else if (type === 'CharacterClass') {
    return /[\]\\]/y;
  } else if (type === 'CharacterClass:First') {
    return /[\]^\\]/y;
  } else if (type === 'Quantifier') {
    return /[{}]/;
  } else {
    throw new Error();
  }
};

const cookEscape = (escape, span) => {
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
    return String.fromCodePoint(parseInt(hexMatch[1], 16));
  }

  let litMatch = /\\([\\nrt0])/y.exec(escape);

  if (litMatch) {
    return escapables.get(litMatch[1]) || litMatch[1];
  }

  let specialMatch = getSpecialPattern(span).exec(escape.slice(1));

  if (specialMatch) {
    return specialMatch[0];
  }

  throw new Error('unable to cook regex escape');
};

const grammar = class RegexMiniparserGrammar {
  // @Node
  Pattern(p) {
    p.eat('/', PN, { path: 'openToken', balanced: '/' });
    p.eatProduction('Alternatives', { path: 'alternatives[]' });
    p.eat('/', PN, { path: 'closeToken', balancer: true });

    if (p.match(/[gimsuy]/y || p.atExpression)) {
      p.eatProduction('Flags', { path: 'flags' });
    }
  }

  // @Node
  Flags(p) {
    const flagsStr = p.match(/[gimsuy]+/y) || '';

    if (flagsStr && !unique(flagsStr)) throw new Error('flags must be unique');

    const attrs = {};

    for (const { 0: name, 1: chr } of Object.entries(flags)) {
      attrs[name] = flagsStr.includes(chr);
    }

    for (const flag of flagsStr) {
      p.eat(flag, KW, { path: 'tokens[]' });
    }

    return { attrs };
  }

  Alternatives(p) {
    do {
      p.eatProduction('Alternative');
    } while (p.eatMatch('|', PN, { path: 'separators[]' }));
  }

  // @Node
  Alternative(p) {
    p.eatProduction('Elements', { path: 'elements[]' });
  }

  Elements(p) {
    while (p.match(/[^|]/y) || p.atExpression) {
      p.eatProduction('Element');
    }
  }

  // @Cover
  Element(p) {
    if (p.match('[')) {
      p.eatProduction('CharacterClass');
    } else if (p.match('(?:')) {
      p.eatProduction('Group');
    } else if (p.match(/\(\?<?[=!]/y)) {
      throw new Error('Lookahead and lookbehind are not supported');
    } else if (p.match('(')) {
      p.eatProduction('CapturingGroup');
    } else if (p.match(/[$^]|\\b|/iy)) {
      p.eatProduction('Assertion');
    } else if (p.match(/\.|\\[dswp]/iy)) {
      p.eatProduction('CharacterSet');
    } else if (p.match('\\g')) {
      p.eatProduction('Gap');
    } else {
      p.eatProduction('Character');
    }

    if (p.match(/[*+?]|{/y)) {
      p.shiftProduction('Quantifier');
    }
  }

  // @Node
  Group(p) {
    p.eat('(?:', PN, { path: 'openToken', balanced: ')' });
    p.eatProduction('Alternatives', { path: 'alternatives[]' });
    p.eat(')', PN, { path: 'closeToken', balancer: true });
  }

  // @Node
  CapturingGroup(p) {
    p.eat('(', PN, { path: 'openToken', balanced: ')' });
    p.eatProduction('Alternatives', { path: 'alternatives[]' });
    p.eat(')', PN, { path: 'closeToken', balancer: true });
  }

  Assertion(p) {
    if (p.match('^')) {
      p.eatProduction('StartOfInputAssertion');
    } else if (p.match('$')) {
      p.eatProduction('EndOfInputAssertion');
    } else if (p.match(/\\b/iy)) {
      p.eatProduction('WordBoundaryAssertion');
    }
  }

  // @CoveredBy('Assertion')
  // @Node
  StartOfInputAssertion(p) {
    p.eat('^', KW, { path: 'sigilToken' });
  }

  // @CoveredBy('Assertion')
  // @Node
  EndOfInputAssertion(p) {
    p.eat('$', KW, { path: 'sigilToken' });
  }

  // @CoveredBy('Assertion')
  // @Node
  WordBoundaryAssertion(p) {
    let attrs;
    if (p.eatMatch('\\', ESC, { path: 'escapeToken' })) {
      const m = p.eat(/b/iy, KW, { path: 'value' });
      attrs = { negate: m === 'B' };
    } else {
      throw new Error('invalid boundary');
    }
    return { attrs };
  }

  // @Node
  Character(p) {
    const specialPattern = getSpecialPattern(p.span);

    if (p.match('\\')) {
      if (
        p.eatMatchEscape(
          new RegExp(
            String.raw`\\(u(\{\d{1,6}\}|\d{4})|x[0-9a-fA-F]{2}|[nrt0]|${specialPattern.source})`,
            'y',
          ),
        )
      ) {
        // done
      } else if (p.eatMatchEscape(new RegExp(String.raw`\\${specialPattern.source}`, 'y'))) {
        // done
      } else {
        throw new Error('escape required');
      }
    } else {
      if (p.match(new RegExp(specialPattern, 'y'))) {
        throw new Error('escape required');
      } else {
        p.eatLiteral(/./sy);
      }
    }
  }

  // @Node
  CharacterClass(p) {
    p.eat('[', PN, { path: 'openToken', balanced: ']', startSpan: 'CharacterClass' });

    const negate = !!p.eatMatch('^', KW, { path: 'negateToken', boolean: true });

    let first = !negate;
    while (p.match(/./sy)) {
      p.eatProduction('CharacterClassElement', { path: 'elements[]' }, { first });
      first = false;
    }

    p.eat(']', PN, { path: 'closeToken', balancer: true, endSpan: 'CharacterClass' });

    return { attrs: { negate } };
  }

  // @Cover
  CharacterClassElement(p, { first }) {
    if (p.match(/.-[^\]\n]/y)) {
      p.eatProduction('CharacterClassRange', undefined, { first });
    } else if (p.match(/\\[dswp]/iy)) {
      p.eatProduction('CharacterSet');
    } else if (p.match('\\g')) {
      p.eatProduction('Gap');
    } else {
      p.eatProduction('Character', when(first, { span: 'CharacterClass:First' }));
    }
  }

  // @Node
  Gap(p) {
    p.eat('\\', PN, { path: 'escapeToken' });
    p.eat('g', KW, { path: 'value' });
  }

  // @Node
  CharacterClassRange(p, { first }) {
    p.eatProduction('Character', {
      path: 'min',
      ...when(first, { span: 'CharacterClass:First' }),
    });
    p.eat('-', PN, { path: 'rangeToken' });
    p.eatProduction('Character', { path: 'max' });
  }

  CharacterSet(p) {
    let attrs;

    if (p.match('.')) {
      p.eatProduction('AnyCharacterSet');
    } else if (p.match(/\\[dD]/y)) {
      p.eatProduction('DigitCharacterSet');
    } else if (p.match(/\\[sS]/y)) {
      p.eatProduction('SpaceCharacterSet');
    } else if (p.match(/\\[wW]/y)) {
      p.eatProduction('WordCharacterSet');
    } else if (p.match(/p/iy)) {
      throw new Error('unicode property character sets are not supported yet');
    } else {
      throw new Error('unknown character set kind');
    }

    return { attrs };
  }

  // @CoveredBy('CharacterSet')
  // @Node
  AnyCharacterSet(p) {
    p.eat('.', KW, { path: 'sigilToken' });
  }

  // @CoveredBy('CharacterSet')
  // @Node
  WordCharacterSet(p) {
    p.eat('\\', PN, { path: 'escapeToken' });

    let attrs;

    if (p.eatMatch('w', KW, { path: 'value' })) {
      //continue
    } else if (p.eatMatch('W', KW, { path: 'value' })) {
      attrs = { negate: true };
    }

    return { attrs };
  }

  // @CoveredBy('CharacterSet')
  // @Node
  SpaceCharacterSet(p) {
    p.eat('\\', PN, { path: 'escapeToken' });

    let attrs;

    if (p.eatMatch('s', KW, { path: 'value' })) {
      //continue
    } else if (p.eatMatch('S', KW, { path: 'value' })) {
      attrs = { negate: true };
    }

    return { attrs };
  }

  // @CoveredBy('CharacterSet')
  // @Node
  DigitCharacterSet(p) {
    p.eat('\\', PN, { path: 'escapeToken' });

    let attrs;

    if (p.eatMatch('d', KW, { path: 'value' })) {
      //continue
    } else if (p.eatMatch('D', KW, { path: 'value' })) {
      attrs = { negate: true };
    }

    return { attrs };
  }

  // @Node
  Quantifier(p) {
    p.eatHeldProduction('Element', { path: 'element' });

    let attrs;

    if (p.eatMatch('*', KW, { path: 'value' })) {
      const greedy = !p.eatMatch('?', KW, { path: 'greedyToken' });
      attrs = { min: 0, max: Infinity, greedy };
    } else if (p.eatMatch('+', KW, { path: 'value' })) {
      const greedy = !p.eatMatch('?', KW, { path: 'greedyToken' });
      attrs = { min: 1, max: Infinity, greedy };
    } else if (p.eatMatch('?', KW, { path: 'value' })) {
      attrs = { min: 0, max: 1, greedy: true };
    } else if (p.match('{')) {
      p.eat('{', PN, { path: 'openToken', balanced: '}' });

      let max;
      let min = p.eat(/\d+/y, 'Number', { path: 'min' });

      if (p.eatMatch(',', PN, { path: 'separator' })) {
        max = p.eatMatch(/\d+/y, 'Number', { path: 'max' });
      }

      p.eat('}', PN, { path: 'closeToken', balancer: true });

      const greedy = !p.eatMatch('?', KW, { path: 'greedyToken' });

      attrs = { min: min && parseInt(min, 10), max: max && parseInt(max, 10), greedy };
    }

    return { attrs };
  }
};

module.exports = { name, canonicalURL, dependencies, covers, grammar, cookEscape };
