import { freeze } from '@bablr/agast-helpers/object';
import { get } from '@bablr/agast-helpers/path';
import { printSource } from '@bablr/agast-helpers/tree';
import objectEntries from 'iter-tools-es/methods/object-entries';

const _ = /\s+/y;
const PN = null;
const KW = 'Keyword';
const LIT = 'Identifier';

export const name = 'JSON';

export const canonicalURL = 'https://bablr.org/languages/core/en/cstml-json';

export const dependencies = {};

export const covers = new Map([
  [
    Symbol.for('@bablr/node'),
    new Set([
      'Property',
      'Object',
      'Array',
      'Boolean',
      'Null',
      'Number',
      'UnsignedInteger',
      'Infinity',
      'NotANumber',
      'Undefined',
      'Digit',
      'Integer',
      'String',
      'StringContent',
      'Identifier',
      'EscapeSequence',
      'EscapeCode',
    ]),
  ],
  ['Expression', new Set(['Object', 'Array', 'Boolean', 'Null', 'Number', 'String'])],
  ['Number', new Set(['Integer', 'Infinity', 'NotANumber'])],
]);

export const escapables = freeze({
  b: '\b',
  f: '\f',
  n: '\n',
  r: '\r',
  t: '\t',
  0: '\0',
});

export const cookEscape = (escape, span) => {
  let hexMatch;

  if (!escape.startsWith('\\')) {
    throw new Error('string escape must start with \\');
  }

  if ((hexMatch = /\\u([0-9a-f]{4})/iy.exec(escape))) {
    //continue
  } else if ((hexMatch = /\\u{([0-9a-f]+)}/iy.exec(escape))) {
    //continue
  }

  if (hexMatch) {
    return String.fromCodePoint(parseInt(hexMatch[1], 16));
  }

  const litPattern = span.type === 'Single' ? /\\([\\gnrt0'])/y : /\\([\\gnrt0"])/y;
  const litMatch = litPattern.exec(escape);

  if (litMatch) {
    if (litMatch[1] === 'g') {
      return null;
    } else {
      return escapables[litMatch[1]] || litMatch[1];
    }
  }

  throw new Error('unable to cook string escape');
};

export const grammar = class JSONMiniparserGrammar {
  Expression(p) {
    if (p.match('[')) {
      p.eatProduction('Array');
    } else if (p.match('{')) {
      p.eatProduction('Object');
    } else if (p.match(/true|false/y)) {
      p.eatProduction('Boolean');
    } else if (p.match('null')) {
      p.eatProduction('Null');
    } else if (p.match('undefined')) {
      p.eatProduction('Undefined');
    } else if (p.match(/[+-]?(?:\d|Infinity)|NaN/y)) {
      p.eatProduction('Number');
    } else if (p.match(/['"]/y)) {
      p.eatProduction('String');
    }
  }

  Object(p) {
    p.eat('{', PN, { path: 'openToken' });

    p.eatMatchTrivia(_);

    let first = true;
    let sep;
    while (first || (sep && (p.match(/./y) || p.atExpression))) {
      p.eatProduction('Property', { path: 'properties[]' });
      if ((sep = p.match(/\s*,/y))) {
        sep = p.eatProduction('ListSeparator', { path: 'separators[]' });
      }
      first = false;
    }

    p.eatMatchTrivia(_);

    p.eat('}', PN, { path: 'closeToken' });
  }

  Property(p) {
    if (p.match(/['"]/y)) {
      p.eatProduction('String', { path: 'key' });
    } else {
      p.eatProduction('Identifier', { path: 'key' });
    }
    p.eatMatchTrivia(_);
    p.eat(':', PN, { path: 'mapToken' });
    p.eatMatchTrivia(_);
    p.eatProduction('Expression', { path: 'value' });
  }

  Array(p) {
    p.eat('[', PN, { path: 'openToken' });

    p.eatMatchTrivia(_);

    let first = true;
    let sep;
    while (first || (sep && (p.match(/./y) || p.atExpression))) {
      p.eatProduction('Expression', { path: 'elements[]' });
      if (p.match(/\s*,/y)) {
        sep = p.eatProduction('ListSeparator', { path: 'separators[]' });
      }

      first = false;
    }

    p.eat(']', PN, { path: 'closeToken' });
  }

  Boolean(p) {
    p.eat(/true|false/y, KW, { path: 'sigilToken' });
  }

  Null(p) {
    p.eat('null', KW, { path: 'sigilToken' });
  }

  ListSeparator(p) {
    p.eatMatchTrivia(_);
    p.eat(/,/y, PN, { path: 'separators[]' });
    p.eatMatchTrivia(_);
  }

  Number(p) {
    if (p.match(/-?\d/y)) {
      p.eatProduction('Integer');
    } else if (p.match('NaN')) {
      p.eatProduction('NaN');
    } else {
      p.eatProduction('Infinity');
    }
  }

  Integer(p) {
    p.eatMatch('-', PN, { path: 'negative' });
    p.eatProduction('Digits', { path: 'digits[]' });
  }

  UnsignedInteger(p) {
    p.eatProduction('Digits', { path: 'digits[]' });
  }

  Infinity(p) {
    p.eatMatch(/[+-]/y, PN, { path: 'sign' });
    p.eat('Infinity', 'Keyword', { path: 'sigilToken' });
  }

  NotANumber(p) {
    p.eat('NaN', 'Keyword', { path: 'sigilToken' });
  }

  Undefined(p) {
    p.eat('undefined', 'Keyword', { path: 'sigilToken' });
  }

  Digits(p) {
    while (p.match(/\d/y)) {
      p.eatProduction('Digit');
    }
  }

  Digit(p) {
    p.eatLiteral(/\d/y);
  }

  Identifier(p) {
    p.eat(/[a-zA-Z]+/y, LIT, { path: 'content' });
  }

  String(p) {
    const q = p.match(/['"]/y) || '"';

    const span = q === '"' ? 'Double' : 'Single';

    p.eat(q, PN, { path: 'openToken', startSpan: span, balanced: q });
    while (p.match(/./sy) || p.atExpression) {
      p.eatProduction('StringContent', { path: 'content' });
    }
    p.eat(q, PN, { path: 'closeToken', endSpan: span, balancer: true });
  }

  StringContent(p) {
    let esc, lit;
    let i = 0;
    do {
      esc = p.match('\\');
      if (esc) {
        p.eatProduction('EscapeSequence', { path: '@' });
      }
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

  EscapeSequence(p) {
    p.pushSpan({ type: 'Escape', guard: null });

    p.eat('\\', PN, { path: 'sigilToken' });

    let m_;
    let cooked;

    if ((m_ = p.eatMatch(/[\\/nrt0]/y, KW, { path: 'code' }))) {
      cooked = escapables[m_] || m_;
    } else if ((m_ = p.eatMatch(/['"]/y, KW, { path: 'code' }))) {
      cooked = m_;
    } else if (p.match('u')) {
      let code = p.eatProduction('EscapeCode', { path: 'code' });

      let value = get('value', code);

      cooked = String.fromCodePoint(parseInt(printSource(value), 16));
    } else {
      p.popSpan();
      p.fail();
      return;
    }
    p.popSpan();
    return { attrs: { cooked } };
  }

  EscapeCode(p) {
    if (p.eatMatch('u', KW, { path: 'type' })) {
      p.eat(/[\da-fA-F]{4}/y, 'UnsignedHexInteger', { path: 'value' });
    }
  }
};

export default { name, canonicalURL, dependencies, covers, grammar, cookEscape };
