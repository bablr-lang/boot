const Regex = require('./regex.js');
const CSTML = require('./cstml.js');
const { buildCovers } = require('../utils.js');
const sym = require('../symbols.js');

const _ = /\s+/y;
const PN = 'Punctuator';
const ID = 'Identifier';
const LIT = 'Literal';

const name = 'Spamex';

const canonicalURL = 'https://github.com/bablr-lang/language-spamex';

const dependencies = { CSTML, Regex };

const covers = buildCovers({
  [sym.node]: ['Attribute', 'Identifier', 'Matcher', 'Literal', 'CSTML:Flags'],
  Attribute: ['MappingAttribute', 'BooleanAttribute'],
  AttributeValue: ['CSTML:String', 'CSTML:Number'],
  Matcher: ['NodeMatcher', 'StringMatcher'],
  StringMatcher: ['CSTML:String', 'Regex:Pattern'],
});

const grammar = class SpamexMiniparserGrammar {
  // @Cover
  Matcher(p) {
    if (p.match(/<(?:[*#@]*[ \t]*)?(?:\w|$)/y)) {
      p.eatProduction('NodeMatcher');
    } else if (p.match(/['"]/y)) {
      p.eatProduction('CSTML:String');
    } else if (p.match('/')) {
      p.eatProduction('Regex:Pattern');
    } else {
      throw new Error(`Unexpected character ${p.chr}`);
    }
  }

  // @Node
  NodeMatcher(p) {
    p.eat('<', PN, { path: 'open', startSpan: 'Tag', balanced: '>' });

    let flags;

    if (p.match(/[*#@]/y)) {
      flags = p.eatProduction('CSTML:Flags', { path: 'flags' });
      p.eatMatchTrivia(_);
    }

    if (p.match(/\w+:/y)) {
      p.eat(/\w+/y, ID, { path: 'language' });
      p.eat(':', PN, { path: 'namespaceOperator' });
      p.eat(/\w+/y, ID, { path: 'type' });
    } else {
      p.eat(/\w+/y, ID, { path: 'type' });
    }

    let sp = p.eatMatchTrivia(_);

    if (flags?.properties.token && sp && (p.match(/['"/]/y) || p.atExpression)) {
      p.eatProduction('StringMatcher', { path: 'value' });

      sp = p.eatMatchTrivia(_);
    }

    if ((sp && p.match(/\w+/y)) || p.atExpression) {
      p.eatProduction('Attributes', { path: 'attributes[]' });
      sp = p.eatMatchTrivia(_);
    }

    p.eatMatchTrivia(_);
    p.eat('>', PN, { path: 'close', endSpan: 'Tag', balancer: true });
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
      p.eatProduction('MappingAttribute');
    } else {
      p.eatProduction('BooleanAttribute');
    }
  }

  // @Node
  BooleanAttribute(p) {
    p.eat(/\w+/y, LIT, { path: 'key' });
  }

  // @Node
  MappingAttribute(p) {
    p.eat(/\w+/y, LIT, { path: 'key' });
    p.eatMatchTrivia(_);
    p.eat('=', PN, { path: 'mapOperator' });
    p.eatMatchTrivia(_);
    p.eatProduction('AttributeValue', { path: 'value' });
  }

  // @Cover
  AttributeValue(p) {
    if (p.match(/['"]/y)) {
      p.eatProduction('CSTML:String');
    } else if (p.match(/-|\d/y)) {
      p.eatProduction('CSTML:Number');
    }
  }

  // @Cover
  StringMatcher(p) {
    if (p.match(/['"]/y)) {
      p.eatProduction('CSTML:String');
    } else {
      p.eatProduction('Regex:Pattern');
    }
  }

  // @Node
  Identifier(p) {
    p.eatLiteral(/\w+/y);
  }
};

module.exports = { name, canonicalURL, dependencies, covers, grammar };
