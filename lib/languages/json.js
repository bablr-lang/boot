import objectEntries from 'iter-tools-es/methods/object-entries';
import * as sym from '@bablr/agast-vm-helpers/symbols';
import * as Spamex from './spamex.js';
import * as CSTML from './cstml.js';
import * as Regex from './regex.js';

const _ = /\s+/y;
const PN = 'Punctuator';
const KW = 'Keyword';
const ID = 'Identifier';

export const name = 'JSON';

export const canonicalURL = 'https://bablr.org/languages/core/en/cstml-json';

export const dependencies = { Spamex, CSTML, Regex };

export const covers = new Map([
  [
    sym.node,
    new Set([
      'Punctuator',
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
    ]),
  ],
  ['Expression', new Set(['Object', 'Array', 'Boolean', 'Null', 'Number', 'String'])],
  ['Number', new Set(['Integer', 'Infinity', 'NotANumber'])],
]);

export const escapables = new Map(
  objectEntries({
    b: '\b',
    f: '\f',
    n: '\n',
    r: '\r',
    t: '\t',
    0: '\0',
  }),
);

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
      return escapables.get(litMatch[1]) || litMatch[1];
    }
  }

  throw new Error('unable to cook string escape');
};

export const grammar = class JSONMiniparserGrammar {
  // @Cover
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

  // @Node
  Object(p) {
    p.eat('{', PN, { path: 'openToken', balanced: '}' });

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

    p.eat('}', PN, { path: 'closeToken', balancer: true });
  }

  // @Node
  Property(p) {
    p.eat(/[a-zA-Z]+/y, ID, { path: 'key' });
    p.eatMatchTrivia(_);
    p.eat(':', PN, { path: 'mapToken' });
    p.eatMatchTrivia(_);
    p.eatProduction('Expression', { path: 'value' });
  }

  // @Node
  Array(p) {
    p.eat('[', PN, { path: 'openToken', balanced: ']' });

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

    p.eat(']', PN, { path: 'closeToken', balancer: true });
  }

  // @Node
  Boolean(p) {
    p.eat(/true|false/y, KW, { path: 'sigilToken' });
  }

  // @Node
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

  // @Node
  Integer(p) {
    p.eatMatch('-', 'Punctuator', { path: 'negative' });
    p.eatProduction('Digits', { path: 'digits[]' });
  }

  // @Node
  UnsignedInteger(p) {
    p.eatProduction('Digits', { path: 'digits[]' });
  }

  // @Node
  Infinity(p) {
    p.eatMatch(/[+-]/, 'Punctuator', { path: 'sign' });
    p.eat('Infinity', 'Keyword', { path: 'sigilToken' });
  }

  // @Node
  NotANumber(p) {
    p.eat('NaN', 'Keyword', { path: 'sigilToken' });
  }

  // @Node
  Undefined(p) {
    p.eat('undefined', 'Keyword', { path: 'sigilToken' });
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

  // @Node
  String(p) {
    const q = p.match(/['"]/y) || '"';

    const span = q === '"' ? 'Double' : 'Single';

    p.eat(q, PN, { path: 'openToken', startSpan: span, balanced: q });
    while (p.match(/./sy) || p.atExpression) {
      p.eatProduction('StringContent', { path: 'content' });
    }
    p.eat(q, PN, { path: 'closeToken', endSpan: span, balancer: true });
  }

  // @Node
  StringContent(p) {
    let esc, lit;
    let i = 0;
    do {
      esc =
        p.span.type === 'Single'
          ? p.eatMatchEscape(/\\(u(\{[0-9a-fA-F]{1,6}\}|\d{4})|[\\gnrt0'])/y)
          : p.eatMatchEscape(/\\(u(\{[0-9a-fA-F]{1,6}\}|\d{4})|[\\gnrt0"])/y);
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
