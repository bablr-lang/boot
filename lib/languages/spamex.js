const regex = require('./regex.js');
const { buildCovers } = require('../utils.js');
const sym = require('../symbols.js');

const { isArray } = Array;
const _ = /\s+/y;
const PN = 'Punctuator';
const KW = 'Keyword';
const ID = 'Identifier';
const LIT = 'Literal';

const name = 'Spamex';

const dependencies = new Map([['Regex', regex]]);

const covers = buildCovers({
  [sym.node]: ['Attribute', 'Argument', 'Identifier', 'Props', 'Expression', 'String'],
  Attribute: ['KeyValueAttribute', 'KeyAttribute'],
  Expression: ['NodeMatcher', 'TokenMatcher', 'StringMatcher', 'RegexMatcher', 'TriviaMatcher'],
  Props: ['ObjectProps', 'MatchablesArrayProps'],
  TagName: ['Identifier', 'GlobalIdentifier'],
});

const grammar = class SpamexMiniparserGrammar {
  // @Cover
  Expression(p, attrs) {
    if (p.match('<| |>')) {
      p.eatProduction('TriviaMatcher', attrs);
    } else if (p.match(/<(?:\w|$)/y)) {
      p.eatProduction('NodeMatcher', attrs);
    } else if (p.match('<|')) {
      p.eatProduction('TokenMatcher', attrs);
    } else if (p.match(/['"]/y)) {
      p.eatProduction('StringMatcher', attrs);
    } else if (p.match('/')) {
      p.eatProduction('RegexMatcher', attrs);
    } else {
      throw new Error(`Unexpected character ${p.chr}`);
    }
  }

  // @Node
  TriviaMatcher(p) {
    p.eat('<|', PN, { path: 'open', startSpan: 'Tag', balanced: '|>' });
    p.eat(' ', KW, { path: 'value' });
    p.eat('|>', PN, { path: 'close', endSpan: 'Tag' });
  }

  // @Node
  NodeMatcher(p) {
    p.eat('<', PN, { path: 'open', startSpan: 'Tag', balanced: '>' });
    p.eatProduction('TagName', { path: 'tagName' });

    let sp = p.eatMatchTrivia(_);

    if (sp && p.match(/\w+/y)) {
      p.eatProduction('Attributes', { path: '[attrs]' });
      sp = p.eatMatchTrivia(_);
    }

    if (sp && p.match('{')) {
      p.eatProduction('Props', { path: 'props' });
      sp = p.eatMatchTrivia(_);
    }

    p.eatMatchTrivia(_);
    p.eat('>', PN, { path: 'close', endSpan: 'Tag' });
  }

  // @Node
  TokenMatcher(p) {
    p.eat('<|', PN, { path: 'open', startSpan: 'Tag', balanced: '|>' });
    p.eatMatchTrivia(_);
    p.eatProduction('TagName', { path: 'tagName' });

    let sp = p.eatMatchTrivia(_);

    if (sp && p.match(/\w+/y)) {
      p.eatProduction('Attributes', { path: '[attrs]' });
      sp = p.eatMatchTrivia(_);
    }

    if (sp && p.match('{')) {
      p.eatProduction('Props', { path: 'props' });
      sp = p.eatMatchTrivia(_);
    }

    if (sp && (/['"]/y.test(p.chr) || (p.atExpression && p.expression.type === 'StringMatcher'))) {
      p.eatProduction('StringMatcher', { path: 'value' });
      sp = p.eatMatchTrivia(_);
    } else if (sp && (p.chr === '/' || (p.atExpression && p.expression.type === 'RegexMatcher'))) {
      p.eatProduction('RegexMatcher', { path: 'value' });
      sp = p.eatMatchTrivia(_);
    }

    p.eatMatchTrivia(_);
    p.eat('|>', PN, { path: 'close', endSpan: 'Tag' });
  }

  Attributes(p, attrs) {
    let sp = true;
    while (
      sp &&
      (p.match(/\w+/y) ||
        (p.atExpression && (isArray(p.expression) || p.expression.type === 'Attribute')))
    ) {
      p.eatProduction('Attribute', attrs);
      sp = p.eatMatch(/\s+/y);
    }
    if (sp && typeof sp === 'string') {
      p.chuck(sp);
    }
  }

  // @Cover
  Attribute(p, attrs) {
    if (p.match(/\w+\s*=/y)) {
      p.eatProduction('KeyValueAttribute', attrs);
    } else {
      p.eatProduction('KeyAttribute', attrs);
    }
  }

  // @Node
  KeyAttribute(p) {
    p.eat(/\w+/y, LIT, { path: 'key' });
  }

  // @Node
  KeyValueAttribute(p) {
    p.eat(/\w+/y, { path: 'key' });
    p.eatMatchTrivia(_);
    p.eat('=', { path: 'mapOperator' });
    p.eatMatchTrivia(_);
    p.eatProduction('String', { path: 'value' });
  }

  // @Cover
  Props(p, attrs) {
    if (p.match('{[')) {
      p.eatProduction('MatchablesArrayProps', attrs);
    } else {
      p.eatProduction('ObjectProps', attrs);
    }
  }

  // @Node
  MatchablesArrayProps(p) {
    p.eat('{[', PN, { path: 'open', balanced: ']}' });

    p.eatMatchTrivia(_);

    let first = true;
    while ((first || p.eatMatch(/\s*/y)) && !p.done) {
      p.eatProduction('Expression', { path: '[values]' });
      first = false;
    }

    p.eatMatchTrivia(_);

    p.eat(']}', PN, { path: 'close' });
  }

  // @Node
  ObjectProps(p) {
    p.eat('{', PN, { path: 'open', balanced: '}' });

    p.eatMatchTrivia(_);

    let first = true;
    while ((first || p.eatMatch(/\s*,\s*/y)) && !p.done) {
      p.eatProduction('Argument', { path: '[values]' });
      first = false;
    }

    p.eatMatchTrivia(_);

    p.eat('}', PN, { path: 'close' });
  }

  // @Node
  Argument(p) {
    p.eat(/\w+/y, { path: 'key' });
    p.eatMatchTrivia(_);
    p.eat(':', PN, { path: 'mapOperator' });
    p.eatMatchTrivia(_);
    p.eatProduction('Expression', { path: 'value' });
  }

  // @Cover
  TagName(p, attrs) {
    if (p.match(/\w+:/y)) {
      p.eatProduction('GlobalIdentifier', attrs);
    } else {
      p.eat(/\w+/y, ID, attrs);
    }
  }

  // @Node
  GlobalIdentifier(p) {
    p.eatProduction('Parser', { path: 'language' });
    p.eat(':');
    p.eat(/\w+/y, ID, { path: 'type' });
  }

  // @Node
  StringMatcher(p) {
    p.eatProduction('StringLiteral');
  }

  // @Node
  String(p) {
    p.eatProduction('StringLiteral');
  }

  StringLiteral(p) {
    const q = p.match(/['"]/y);

    if (!q) throw new Error();

    p.eat(q, PN, { path: 'open', startSpan: 'String', balanced: q });
    p.eatMatch(q === '"' ? /[^\n"]*/y : /[^\n']*/y, LIT, { path: 'value' });
    p.eat(q, PN, { path: 'close', endSpan: 'String' });
  }

  // @Node
  RegexMatcher(p) {
    p.eat('/', PN, { path: 'openAlternatives', startSpan: 'Expression', balanced: '/' });
    p.eatProduction('Regex:Alternatives', { path: 'alternatives' });
    p.eat('/', PN, { path: 'closeAlternatives', endSpan: 'Expression' });
    p.eatProduction('Regex:Flags', { path: 'flags' });
  }
};

module.exports = { name, dependencies, covers, grammar };
