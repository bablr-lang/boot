const regex = require('./regex.js');
const { buildCovers } = require('../utils.js');
const { node, gap } = require('../symbols.js');

const { isArray } = Array;
const _ = /\s+/y;

const name = 'Spamex';

const dependencies = new Map([['Regex', regex]]);

const covers = buildCovers({
  [node]: ['Attribute', 'Argument', 'Identifier', 'Props', 'Expression', 'String'],
  Attribute: ['KeyValueAttribute', 'KeyAttribute'],
  Expression: ['TagMatcher', 'StringMatcher', 'RegexMatcher'],
  Props: ['ObjectProps', 'MatchablesArrayProps'],
  Identifier: ['LocalIdentifier', 'GlobalIdentifier'],
});

const grammar = class SpamexMiniparserGrammar {
  // @Cover
  Expression(p) {
    if (p.match('< >')) {
      p.eatProduction('TriviaMatcher');
    } else if (p.match(/<(?:\w|$)/y)) {
      p.eatProduction('NodeMatcher');
    } else if (p.match(/['"]/y)) {
      p.eatProduction('StringMatcher');
    } else if (p.match('/')) {
      p.eatProduction('RegexMatcher');
    } else {
      throw new Error(`Unexpected character ${p.chr}`);
    }
  }

  TriviaMatcher(p) {
    p.eat('<', { startSpan: 'Tag', balanced: '>' });
    p.eat(' ');
    p.eat('>', { endSpan: 'Tag' });
  }

  // @Node
  NodeMatcher(p) {
    p.eat('<', { startSpan: 'Tag', balanced: '>' });

    p.eatProduction('Identifier', { path: 'tagName' });

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

    sp && p.match('{') ? p.eatProduction('Props', { path: 'props' }) : [];

    p.eatMatch(_);
    p.eat('>', { endSpan: 'Tag' });
  }

  Attributes(p) {
    let sp = true;
    while (
      sp &&
      (p.match(/\w+/y) ||
        (p.atExpression && (isArray(p.expression) || p.expression.type === 'Attribute')))
    ) {
      p.eatProductions('Attribute', { path: '[attrs]' });
      sp = p.eatMatch(/\s+/y);
    }
    if (sp && typeof sp === 'string') {
      p.chuck(sp);
    }
  }

  // @Cover
  Attribute(p) {
    if (p.match(/\w+\s*=/y)) {
      p.eatProduction('KeyValueAttribute');
    } else {
      p.eatProduction('KeyAttribute');
    }
  }

  // @Node
  KeyAttribute(p) {
    p.eat(/\w+/y, { path: 'key' });
  }

  // @Node
  KeyValueAttribute(p) {
    p.eat(/\w+/y, { path: 'key' });
    p.eatMatch(_);
    p.eat('=');
    p.eatMatch(_);
    p.eatProduction('String', { path: 'value' });
  }

  // @Cover
  Props(p) {
    if (p.match('{[')) {
      p.eatProduction('MatchablesArrayProps');
    } else {
      p.eatProduction('ObjectProps');
    }
  }

  // @Node
  MatchablesArrayProps(p) {
    p.eat('{[', { balanced: ']}' });

    p.eatMatch(_);

    let first = true;
    while ((first || p.eatMatch(/\s*/y)) && !p.done) {
      p.eatProductions('Expression');
      first = false;
    }

    p.eatMatch(_);

    p.eat(']}');
  }

  // @Node
  ObjectProps(p) {
    p.eat('{', { balanced: '}' });

    p.eatMatch(_);

    let first = true;
    while ((first || p.eatMatch(/\s*,\s*/y)) && !p.done) {
      p.eatProductions('Argument');
      first = false;
    }

    p.eatMatch(_);

    p.eat('}');
  }

  // @Node
  Argument(p) {
    p.eat(/\w+/y, { path: 'key' });
    p.eatMatch(_);
    p.eat(':');
    p.eatMatch(_);
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
    p.eatProduction('Parser', { path: 'parser' });
    p.eat(':');
    p.eatProduction('LocalIdentifier', { path: 'production' });
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

    p.eat(q, { startSpan: 'String', balanced: q });

    p.eatMatch(q === '"' ? /[^\n"]*/y : /[^\n']*/y);

    p.eat(q, { endSpan: 'String' });
  }

  // @Node
  RegexMatcher(p) {
    p.eat('/', { startSpan: 'Expression', balanced: '/' });
    p.eatProduction('Regex:Alternatives', { path: 'alternatives' });
    p.eat('/', { endSpan: 'Expression' });
    p.eatProduction('Regex:Flags', { path: 'flags' });
  }
};

module.exports = { name, dependencies, covers, grammar };
