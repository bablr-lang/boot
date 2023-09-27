const regex = require('./regex.js');
const { buildCovers } = require('../utils.js');
const { node, gap } = require('../symbols.js');

const { isArray } = Array;
const _ = /\s+/y;

const name = 'Spamex';

const dependencies = new Map([['Regex', regex]]);

const covers = buildCovers({
  [node]: ['Attribute', 'Argument', 'Identifier', 'Expression', 'String'],
  Attribute: ['KeyValueAttribute', 'KeyAttribute'],
  Expression: ['TagMatcher', 'StringMatcher', 'RegexMatcher'],
  TagMatcher: ['TokenMatcher', 'NodeMatcher'],
});

function parseString(raw) {
  let cooked = '';
  let escaped = false;

  for (const chr of raw) {
    if (chr === '\\') {
      escaped = true;
    } else {
      if (escaped) {
        // TODO: do escape processing things
        escaped = false;
      } else {
        cooked += chr;
      }
    }
  }
  return cooked;
}

const grammar = class SpamexMiniparserGrammar {
  // @Node
  Expression(p) {
    if (p.match('<|[')) {
      throw new Error('gap token syntax is illegal in grammar definitions');
    } else if (p.match('<|') || p.match('<| |>')) {
      return p.eatProduction('TokenMatcher');
    } else if (p.match(/<(?:\w|$)/y)) {
      return p.eatProduction('NodeMatcher');
    } else if (p.match(/['"]/y)) {
      return p.eatProduction('StringMatcher');
    } else if (p.match('/')) {
      return p.eatProduction('RegexMatcher');
    } else {
      throw new Error(`Unexpected character ${p.chr}`);
    }
  }

  // @Node
  TokenMatcher(p) {
    p.eat('<|', { startSpan: 'Tag', balanced: '|>' });
    p.eatMatch(_);

    if (p.eatMatch('|>', { endSpan: 'Tag' })) {
      return { tagName: 'Trivia', value: undefined, attrs: [] };
    }

    const tagName = p.eatProduction('Identifier');

    let sp = p.eatMatch(_);

    let value = null;
    if (sp && (/['"]/y.test(p.chr) || (p.atExpression && p.expression.type === 'StringMatcher'))) {
      value = p.eatProduction('StringMatcher');
    } else if (sp && (p.chr === '/' || (p.atExpression && p.expression.type === 'RegexMatcher'))) {
      value = p.eatProduction('RegexMatcher');
    }

    sp = value ? p.eatMatch(_) : sp;

    const attrs = sp ? p.eatProduction('Attributes') : [];

    sp = attrs.length ? p.eatMatch(_) : sp;

    const props = sp && p.match('{') ? p.eatProduction('Props') : [];

    p.eatMatch(_);
    p.eat('|>', { endSpan: 'Tag' });

    return { tagName, value, attrs, props };
  }

  // @Node
  NodeMatcher(p) {
    p.eat('<', { startSpan: 'Tag', balanced: '>' });

    const tagName = p.eatProduction('Identifier');

    let sp = p.eatMatch(_);

    const attrs = sp ? p.eatProduction('Attributes') : [];

    sp = attrs.length ? p.eatMatch(_) : sp;

    const props = sp && p.match('{') ? p.eatProduction('Props') : [];

    p.eatMatch(_);
    p.eat('>', { endSpan: 'Tag' });

    return { tagName, attrs, props };
  }

  Attributes(p) {
    const matchers = [];
    let sp = true;
    while (
      sp &&
      (p.match(/\w+/y) ||
        (p.atExpression && (isArray(p.expression) || p.expression.type === 'Attribute')))
    ) {
      matchers.push(...p.eatProductions('Attribute'));
      sp = p.eatMatch(/\s+/y);
    }
    if (sp && typeof sp === 'string') {
      p.chuck(sp);
    }
    return matchers;
  }

  Attribute(p) {
    if (p.match(/\w+\s*=/y)) {
      return p.eatProduction('KeyValueAttribute');
    } else {
      return p.eatProduction('KeyAttribute');
    }
  }

  // @Node
  KeyAttribute(p) {
    const key = p.eat(/\w+/y);
    return { key };
  }

  // @Node
  KeyValueAttribute(p) {
    const key = p.eat(/\w+/y);
    p.eatMatch(_);
    p.eat('=');
    p.eatMatch(_);
    const str = p.eatProduction('String');

    return { key, value: str === gap ? gap : str.value };
  }

  Props(p) {
    const props = [];

    const aQuote = p.match('{[');

    const oQuote = aQuote ? '{[' : '{';
    const cQuote = aQuote ? ']}' : '}';
    const spanSuffix = aQuote ? ':Expressions' : '';
    const span = `Tag:Props${spanSuffix}`;

    p.eat(oQuote, { balanced: cQuote, startSpan: span });

    p.eatMatch(_);

    let first = true;
    while ((first || p.eatMatch(aQuote ? /\s*/y : /\s*,\s*/y)) && !p.done) {
      props.push(...p.eatProductions(aQuote ? 'Expression' : 'Argument'));
      first = false;
    }

    p.eatMatch(_);

    p.eat(cQuote, { endSpan: span });

    return aQuote
      ? [
          {
            type: 'Argument',
            children: [{ type: 'ReferenceTag' }],
            properties: { key: 'expressions', value: props },
          },
        ]
      : props;
  }

  // @Node
  Argument(p) {
    const key = p.eat(/\w+/y);
    p.eatMatch(_);
    p.eat(':');
    p.eatMatch(_);
    const value = p.eatProduction('Expression');

    return { key, value };
  }

  // @Node
  Identifier(p) {
    const language = p.language.name;
    const firstPart = p.eat(/\w+/y);
    const sep = p.eatMatch(':');
    const secondPart = sep ? p.eatMatch(/\w+/y) : null;
    return sep
      ? { language: firstPart, production: secondPart }
      : { language, production: firstPart };
  }

  // @Node
  StringMatcher(p) {
    return p.eatProduction('StringLiteral');
  }

  // @Node
  String(p) {
    return p.eatProduction('StringLiteral');
  }

  StringLiteral(p) {
    const q = p.match(/['"]/y);

    if (!q) throw new Error();

    p.eat(q, { startSpan: 'String', balanced: q });

    const raw = p.eatMatch(q === '"' ? /[^\n"]*/y : /[^\n']*/y);

    p.eat(q, { endSpan: 'String' });

    return { value: parseString(raw) };
  }

  // @Node
  RegexMatcher(p) {
    p.eat('/', { startSpan: 'Expression', balanced: '/' });
    const alternatives = p.eatProduction('Regex:Alternatives');
    p.eat('/', { endSpan: 'Expression' });
    const flags = p.eatProduction('Regex:Flags');
    return { alternatives, flags: { ...flags, sticky: true } };
  }
};

module.exports = { name, dependencies, covers, grammar };
