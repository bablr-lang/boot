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
  [sym.node]: ['Attribute', 'Argument', 'Identifier', 'Props', 'Matchable', 'Boolean'],
  Attribute: ['StringAttribute', 'BooleanAttribute'],
  Matchable: ['NodeMatcher', 'TokenMatcher', 'TriviaMatcher', 'String', 'Regex'],
  Expression: ['NodeMatcher', 'TokenMatcher', 'TriviaMatcher', 'String', 'Regex', 'Boolean'],
  Props: ['ObjectProps', 'MatchablesArrayProps'],
  TagType: ['Identifier', 'GlobalIdentifier'],
});

const grammar = class SpamexMiniparserGrammar {
  // @Cover
  Matchable(p) {
    if (p.match('<| |>')) {
      p.eatProduction('TriviaMatcher');
    } else if (p.match(/<(?:\w|$)/y)) {
      p.eatProduction('NodeMatcher');
    } else if (p.match('<|')) {
      p.eatProduction('TokenMatcher');
    } else if (p.match(/['"]/y)) {
      p.eatProduction('String');
    } else if (p.match('/')) {
      p.eatProduction('Regex');
    } else {
      throw new Error(`Unexpected character ${p.chr}`);
    }
  }

  // @Cover
  Expression(p) {
    if (p.match('<| |>')) {
      p.eatProduction('TriviaMatcher');
    } else if (p.match(/<(?:\w|$)/y)) {
      p.eatProduction('NodeMatcher');
    } else if (p.match('<|')) {
      p.eatProduction('TokenMatcher');
    } else if (p.match(/['"]/y)) {
      p.eatProduction('String');
    } else if (p.match('/')) {
      p.eatProduction('Regex');
    } else if (p.match(/true|false/y)) {
      p.eatProduction('Boolean');
    } else {
      throw new Error(`Unexpected character ${p.chr}`);
    }
  }

  // @Node
  TriviaMatcher(p) {
    p.eat('<|', PN, { path: 'open', startSpan: 'Tag', balanced: '|>' });
    p.eat(' ', KW, { path: 'value' });
    p.eat('|>', PN, { path: 'close', endSpan: 'Tag', balancer: true });
  }

  // @Node
  NodeMatcher(p) {
    p.eat('<', PN, { path: 'open', startSpan: 'Tag', balanced: '>' });
    p.eatProduction('TagType', { path: 'type' });

    let sp = p.eatMatchTrivia(_);

    if ((sp && p.match(/\w+/y)) || p.atExpression) {
      p.eatProduction('Attributes', { path: '[attrs]' });
      sp = p.eatMatchTrivia(_);
    }

    if (sp && p.match('{')) {
      p.eatProduction('Props', { path: 'props' });
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
    }

    if (sp && p.match(/\w+/y)) {
      p.eatProduction('Attributes', { path: '[attrs]' });
      sp = p.eatMatchTrivia(_);
    }

    if (sp && p.match('{')) {
      p.eatProduction('Props', { path: 'props' });
      sp = p.eatMatchTrivia(_);
    }

    p.eatMatchTrivia(_);
    p.eat('|>', PN, { path: 'close', endSpan: 'Tag', balancer: true });
  }

  Attributes(p) {
    let sp = true;
    while (sp && (p.match(/\w+/y) || p.atExpression)) {
      p.eatProduction('Attribute');
      sp = p.eatMatchTrivia(_);
    }
    if (sp && typeof sp === 'string') {
      p.chuck(sp);
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
  Props(p) {
    if (p.match('{[')) {
      p.eatProduction('MatchablesArrayProps');
    } else {
      p.eatProduction('ObjectProps');
    }
  }

  // @Node
  MatchablesArrayProps(p) {
    p.eat('{[', PN, { path: 'open', balanced: ']}' });

    let sp = p.eatMatchTrivia(_);

    while (sp && !p.done) {
      p.eatProduction('Matchable', { path: '[values]' });
      sp = p.eatMatchTrivia(_);
    }

    p.eat(']}', PN, { path: 'close', balancer: true });
  }

  // @Node
  ObjectProps(p) {
    p.eat('{', PN, { path: 'open', balanced: '}' });

    p.eatMatchTrivia(_);

    let first = true;
    while ((first || p.match(/\s*,/y)) && !p.done) {
      if (!first) {
        p.eatMatchTrivia(_);
        p.eat(',', PN, { path: '[separators]' });
        p.eatMatchTrivia(_);
      }
      p.eatProduction('Argument', { path: '[values]' });
      first = false;
    }

    p.eatMatchTrivia(_);

    p.eat('}', PN, { path: 'close', balancer: true });
  }

  // @Node
  Argument(p) {
    p.eat(/\w+/y, LIT, { path: 'key' });
    p.eatMatchTrivia(_);
    p.eat(':', PN, { path: 'mapOperator' });
    p.eatMatchTrivia(_);
    p.eatProduction('Expression', { path: 'value' });
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
    p.eat(':', PN, { path: 'mapOperator' });
    p.eat(/\w+/y, ID, { path: 'type' });
  }

  // @Node
  String(p) {
    p.eatProduction('StringLiteral');
  }

  // @Node
  String(p) {
    p.eatProduction('StringLiteral');
  }

  StringLiteral(p) {
    const q = p.match(/['"]/y) || '"';

    p.eat(q, PN, { path: 'open', startSpan: 'String', balanced: q });
    p.eatMatch(q === '"' ? /[^\n"]*/y : /[^\n']*/y, LIT, { path: 'value' });
    p.eat(q, PN, { path: 'close', endSpan: 'String', balancer: true });
  }

  // @Node
  Boolean(p) {
    p.eat(/true|false/y, KW, { path: 'value' });
  }

  // @Node
  Regex(p) {
    p.eatProduction('RegexLiteral');
  }

  // @Node
  Regex(p) {
    p.eatProduction('RegexLiteral');
  }

  // @Node
  RegexLiteral(p) {
    p.eat('/', PN, { path: 'open', startSpan: 'Bare', balanced: '/' });
    p.eatProduction('Regex:Alternatives', { path: '[alternatives]' });
    p.eat('/', PN, { path: 'close', endSpan: 'Bare', balancer: true });
    p.eatProduction('Regex:Flags', { path: 'flags' });
  }
};

module.exports = { name, dependencies, covers, grammar };
