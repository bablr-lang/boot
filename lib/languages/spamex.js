const regex = require('./regex.js');
const { buildCovers } = require('../utils.js');
const sym = require('../symbols.js');

const { isArray } = Array;
const _ = /\s+/y;

const name = 'Spamex';

const dependencies = new Map([['Regex', regex]]);

const covers = buildCovers({
  [sym.node]: ['Attribute', 'Argument', 'Identifier', 'Props', 'Expression', 'String'],
  Attribute: ['KeyValueAttribute', 'KeyAttribute'],
  Expression: ['NodeMatcher', 'TokenMatcher', 'StringMatcher', 'RegexMatcher'],
  Props: ['ObjectProps', 'MatchablesArrayProps'],
  Identifier: ['LocalIdentifier', 'GlobalIdentifier'],
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

  TriviaMatcher(p) {
    p.eat('<|', 'Punctuator', { startSpan: 'Tag', balanced: '|>' });
    p.eat(' ', 'Keyword');
    p.eat('|>', 'Punctuator', { endSpan: 'Tag' });
  }

  // @Node
  NodeMatcher(p) {
    p.eat('<', 'Punctuator', { startSpan: 'Tag', balanced: '>' });
    p.eatProduction('Identifier', { path: 'tagName' });

    let sp = p.eatMatch(_, 'Trivia');

    if (sp && p.match(/\w+/y)) {
      p.eatProduction('Attributes', { path: '[attrs]' });
      sp = p.eatMatch(_, 'Trivia');
    }

    if (sp && p.match('{')) {
      p.eatProduction('Props', { path: 'props' });
      sp = p.eatMatch(_, 'Trivia');
    }

    p.eatMatch(_, 'Trivia');
    p.eat('>', 'Punctuator', { endSpan: 'Tag' });
  }

  // @Node
  TokenMatcher(p) {
    p.eat('<|', 'Punctuator', { startSpan: 'Tag', balanced: '|>' });
    p.eatMatch(_, 'Trivia');
    p.eatProduction('Identifier', { path: 'tagName' });

    let sp = p.eatMatch(_, 'Trivia');

    if (sp && p.match(/\w+/y)) {
      p.eatProduction('Attributes', { path: '[attrs]' });
      sp = p.eatMatch(_, 'Trivia');
    }

    if (sp && p.match('{')) {
      p.eatProduction('Props', { path: 'props' });
      sp = p.eatMatch(_, 'Trivia');
    }

    if (sp && (/['"]/y.test(p.chr) || (p.atExpression && p.expression.type === 'StringMatcher'))) {
      p.eatProduction('StringMatcher', { path: 'value' });
      sp = p.eatMatch(_, 'Trivia');
    } else if (sp && (p.chr === '/' || (p.atExpression && p.expression.type === 'RegexMatcher'))) {
      p.eatProduction('RegexMatcher', { path: 'value' });
      sp = p.eatMatch(_, 'Trivia');
    }

    p.eatMatch(_, 'Trivia');
    p.eat('|>', 'Punctuator', { endSpan: 'Tag' });
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
    p.eat(/\w+/y, { path: 'key' });
  }

  // @Node
  KeyValueAttribute(p) {
    p.eat(/\w+/y, { path: 'key' });
    p.eatMatch(_, 'Trivia');
    p.eat('=');
    p.eatMatch(_, 'Trivia');
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
    p.eat('{[', { balanced: ']}' });

    p.eatMatch(_, 'Trivia');

    let first = true;
    while ((first || p.eatMatch(/\s*/y)) && !p.done) {
      p.eatProduction('Expression', { path: '[values]' });
      first = false;
    }

    p.eatMatch(_, 'Trivia');

    p.eat(']}');
  }

  // @Node
  ObjectProps(p) {
    p.eat('{', { balanced: '}' });

    p.eatMatch(_, 'Trivia');

    let first = true;
    while ((first || p.eatMatch(/\s*,\s*/y)) && !p.done) {
      p.eatProduction('Argument', { path: '[values]' });
      first = false;
    }

    p.eatMatch(_, 'Trivia');

    p.eat('}');
  }

  // @Node
  Argument(p) {
    p.eat(/\w+/y, { path: 'key' });
    p.eatMatch(_, 'Trivia');
    p.eat(':');
    p.eatMatch(_, 'Trivia');
    p.eatProduction('Expression', { path: 'value' });
  }

  // @Cover
  Identifier(p, attrs) {
    if (p.match(/\w+:/y)) {
      p.eatProduction('GlobalIdentifier', attrs);
    } else {
      p.eatProduction('LocalIdentifier', attrs);
    }
  }

  // @Node
  LocalIdentifier(p) {
    p.eat(/\w+/y);
  }

  // @Node
  GlobalIdentifier(p) {
    p.eatProduction('Parser', { path: 'language' });
    p.eat(':');
    p.eatProduction('LocalIdentifier', { path: 'type' });
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

    p.eat(q, 'Punctuator', { startSpan: 'String', balanced: q });

    p.eatMatch(q === '"' ? /[^\n"]*/y : /[^\n']*/y, 'Literal');

    p.eat(q, 'Punctuator', { endSpan: 'String' });
  }

  // @Node
  RegexMatcher(p) {
    p.eat('/', 'Punctuator', { startSpan: 'Expression', balanced: '/' });
    p.eatProduction('Regex:Alternatives', { path: 'alternatives' });
    p.eat('/', 'Punctuator', { endSpan: 'Expression' });
    p.eatProduction('Regex:Flags', { path: 'flags' });
  }
};

module.exports = { name, dependencies, covers, grammar };
