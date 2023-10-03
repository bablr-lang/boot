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
    if (p.match('< >')) {
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
    p.eat('<', { startSpan: 'Tag', balanced: '>' });
    p.eat(' ');
    p.eat('>', { endSpan: 'Tag' });
  }

  // @Node
  NodeMatcher(p) {
    p.eat('<', { startSpan: 'Tag', balanced: '>' });

    p.eatProduction('Identifier', { path: 'tagName' });

    let sp = p.eatMatch(_);

    sp ? p.eatProduction('Attributes') : [];

    const { attrs } = p.path.properties;

    sp = attrs.length ? p.eatMatch(_) : sp;

    sp && p.match('{') ? p.eatProduction('Props', { path: 'props' }) : [];

    p.eatMatch(_);
    p.eat('>', { endSpan: 'Tag' });
  }

  // @Node
  TokenMatcher(p) {
    const { properties } = p.path;

    p.eat('<|', { startSpan: 'Tag', balanced: '|>' });

    p.eatMatch(_);

    p.eatProduction('Identifier', { path: 'tagName' });

    let sp = p.eatMatch(_);

    sp ? p.eatProduction('Attributes') : [];

    const { attrs } = properties;

    sp = attrs?.length ? p.eatMatch(_) : sp;

    sp && p.match('{') ? p.eatProduction('Props', { path: 'props' }) : [];

    if (sp && (/['"]/y.test(p.chr) || (p.atExpression && p.expression.type === 'StringMatcher'))) {
      p.eatProduction('StringMatcher', { path: 'value' });
    } else if (sp && (p.chr === '/' || (p.atExpression && p.expression.type === 'RegexMatcher'))) {
      p.eatProduction('RegexMatcher', { path: 'value' });
    }

    const { value } = properties;

    sp = value ? p.eatMatch(_) : sp;

    p.eatMatch(_);
    p.eat('|>', { endSpan: 'Tag' });
  }

  Attributes(p) {
    let sp = true;
    while (
      sp &&
      (p.match(/\w+/y) ||
        (p.atExpression && (isArray(p.expression) || p.expression.type === 'Attribute')))
    ) {
      p.eatProduction('Attribute', { path: '[attrs]' });
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
    p.eatMatch(_);
    p.eat('=');
    p.eatMatch(_);
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

    p.eatMatch(_);

    let first = true;
    while ((first || p.eatMatch(/\s*/y)) && !p.done) {
      p.eatProduction('Expression');
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
      p.eatProduction('Argument');
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

const normalizer = class SpamexNormalizerGrammar {
  TokenMatcher(node) {
    return {
      tagName: 'NodeMatcher',
      attrs: node.attrs,
      properties: {},
      children: [node.properties.value],
    };
  }
};

module.exports = { name, dependencies, covers, grammar };
