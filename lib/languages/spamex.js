const Regex = require('./regex.js');
const StringLanguage = require('./string.js');
const { buildCovers } = require('../utils.js');
const sym = require('../symbols.js');

const _ = /\s+/y;
const PN = 'Punctuator';
const KW = 'Keyword';
const ID = 'Identifier';
const LIT = 'Literal';

const name = 'Spamex';

const dependencies = { Regex, String: StringLanguage };

const covers = buildCovers({
  [sym.node]: ['Attribute', 'Path', 'Argument', 'TagType', 'Matcher', 'Literal'],
  Attribute: ['StringAttribute', 'BooleanAttribute'],
  Matcher: ['NodeMatcher', 'TokenMatcher', 'TriviaTokenMatcher', 'StringMatcher'],
  StringMatcher: ['String:String', 'Regex:Pattern'],
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
      p.eatProduction('String:String');
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
    p.eatMatchTrivia(_);
    p.eatProduction('StringMatcher', { path: 'value' });

    let sp = p.eatMatchTrivia(_);

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
    p.eat(/\w+/y, ID, { path: 'value' });
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
    p.eatProduction('String:String', { path: 'value' });
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
      p.eatProduction('String:String');
    } else {
      p.eatProduction('Regex:Pattern');
    }
  }
};

module.exports = { name, dependencies, covers, grammar };
