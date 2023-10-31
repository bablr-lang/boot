const Regex = require('./regex.js');
const { buildCovers } = require('../utils.js');
const sym = require('../symbols.js');

const _ = /\s+/y;
const PN = 'Punctuator';
const KW = 'Keyword';
const ID = 'Identifier';
const LIT = 'Literal';

const name = 'Spamex';

const dependencies = { Regex };

const covers = buildCovers({
  [sym.node]: ['Attribute', 'Path', 'Argument', 'TagType', 'Matcher', 'Literal'],
  Attribute: ['StringAttribute', 'BooleanAttribute'],
  Matcher: ['NodeMatcher', 'TokenMatcher', 'TriviaTokenMatcher', 'StringMatcher'],
  StringMatcher: ['String', 'Regex:Pattern'],
  TagType: ['Identifier', 'GlobalIdentifier'],
});

const grammar = class SpamexMiniparserGrammar {
  // @Cover
  Matcher(p) {
    if (p.match('<| |>')) {
      p.eatProduction('TriviaTokenMatcher');
    } else if (p.match(/<(?:\w|$)/y)) {
      p.eatProduction('NodeMatcher');
    } else if (p.match('<|')) {
      p.eatProduction('TokenMatcher');
    } else if (p.match(/['"]/y)) {
      p.eatProduction('String');
    } else if (p.match('/')) {
      p.eatProduction('Regex:Pattern');
    } else {
      throw new Error(`Unexpected character ${p.chr}`);
    }
  }

  // @Node
  TriviaTokenMatcher(p) {
    p.eat('<|', PN, { path: 'open', startSpan: 'Tag', balanced: '|>' });
    p.eat(' ', KW, { path: 'value' });
    p.eat('|>', PN, { path: 'close', endSpan: 'Tag', balancer: true });
  }

  // @Node
  NodeMatcher(p) {
    p.eat('<', PN, { path: 'open', startSpan: 'Tag', balanced: '>' });
    p.eatProduction('TagType', { path: 'type' });

    let sp = p.eatMatchTrivia(_);

    if (sp && p.match('.')) {
      p.eatProduction('Path', { path: 'path' });
      sp = p.eatMatchTrivia(_);
    }

    if ((sp && p.match(/\w+/y)) || p.atExpression) {
      p.eatProduction('Attributes', { path: '[attributes]' });
      sp = p.eatMatchTrivia(_);
    }

    p.eatMatchTrivia(_);
    p.eat('>', PN, { path: 'close', endSpan: 'Tag', balancer: true });
  }

  // @Node
  TokenMatcher(p) {
    p.eat('<|', PN, { path: 'open', startSpan: 'Tag', balanced: '|>' });
    p.eatMatchTrivia(_);
    p.eatProduction('TagType', { path: 'type' });

    let sp = p.eatMatchTrivia(_);

    if (sp && (/['"]/y.test(p.chr) || (p.atExpression && p.expression.type === 'String'))) {
      p.eatProduction('String', { path: 'value' });
      sp = p.eatMatchTrivia(_);
    } else if (sp && (p.chr === '/' || (p.atExpression && p.expression.type === 'Regex'))) {
      p.eatProduction('Regex', { path: 'value' });
      sp = p.eatMatchTrivia(_);
    } else {
      throw new Error();
    }

    if (sp && p.match('.')) {
      p.eatProduction('Path', { path: 'path' });
      sp = p.eatMatchTrivia(_);
    }

    if (sp && p.match(/\w+/y)) {
      p.eatProduction('Attributes', { path: '[attributes]' });
      sp = p.eatMatchTrivia(_);
    }

    p.eatMatchTrivia(_);
    p.eat('|>', PN, { path: 'close', endSpan: 'Tag', balancer: true });
  }

  // @Node
  Path(p) {
    p.eat('.', PN, { path: 'accessOperator' });
    let isArray = !!p.match('[');
    if (isArray) {
      p.eat('[', PN, { path: 'openArrayBracket' });
      p.eatMatchTrivia(_);
      p.eat(/\w+/y, ID, { path: 'value' });
      p.eatMatchTrivia(_);
      p.eat(']', PN, { path: 'closeArrayBracket' });
    } else {
      p.eat(/\w+/y, ID, { path: 'value' });
    }
    return { attrs: { isArray } };
  }

  Attributes(p) {
    let sp = true;
    while (sp && (p.match(/\w+/y) || p.atExpression)) {
      p.eatProduction('Attribute');
      if (p.match(/\s+\w/y)) {
        sp = p.eatMatchTrivia(_);
      }
    }
  }

  // @Cover
  Attribute(p) {
    if (p.match(/\w+\s*=/y)) {
      p.eatProduction('StringAttribute');
    } else {
      p.eatProduction('BooleanAttribute');
    }
  }

  // @Node
  BooleanAttribute(p) {
    p.eat(/\w+/y, LIT, { path: 'key' });
  }

  // @Node
  StringAttribute(p) {
    p.eat(/\w+/y, LIT, { path: 'key' });
    p.eatMatchTrivia(_);
    p.eat('=', PN, { path: 'mapOperator' });
    p.eatMatchTrivia(_);
    p.eatProduction('String', { path: 'value' });
  }

  // @Cover
  TagType(p) {
    if (p.match(/\w+:/y)) {
      p.eatProduction('GlobalIdentifier');
    } else {
      p.eat(/\w+/y, ID, { path: 'type' });
    }
  }

  // @Node
  GlobalIdentifier(p) {
    p.eat(/\w+/y, ID, { path: 'language' });
    p.eat(':', PN, { path: 'namespaceOperator' });
    p.eat(/\w+/y, ID, { path: 'type' });
  }

  // @Cover
  StringMatcher(p) {
    if (p.match(/['"]/y)) {
      p.eatProduction('String');
    } else {
      p.eatProduction('Regex:Pattern');
    }
  }

  // @Node
  String(p) {
    const q = p.match(/['"]/y) || '"';

    const span = q === '"' ? 'String:Double' : 'String:Single';

    p.eat(q, PN, { path: 'open', startSpan: span, balanced: q });
    if (p.match(/./sy) || p.atExpression) {
      p.eatProduction('Literal', { path: 'value' });
    }
    p.eat(q, PN, { path: 'close', endSpan: span, balancer: true });
  }

  Literal(p) {
    if (p.span.type === 'String:Single') {
      p.eatStr(/[^\n']*/y);
    } else if (p.span.type === 'String:Double') {
      p.eatStr(/[^\n"]*/y);
    } else {
      throw new Error();
    }
  }
};

module.exports = { name, dependencies, covers, grammar };
