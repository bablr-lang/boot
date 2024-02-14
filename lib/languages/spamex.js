const Regex = require('./regex.js');
const StringLanguage = require('./string.js');
const Number = require('./number.js');
const { buildCovers } = require('../utils.js');
const sym = require('../symbols.js');

const _ = /\s+/y;
const PN = 'Punctuator';
const ID = 'Identifier';
const LIT = 'Literal';

const name = 'Spamex';

const dependencies = { Regex, String: StringLanguage, Number };

const covers = buildCovers({
  [sym.node]: ['Attribute', 'TagType', 'Matcher', 'Literal'],
  Attribute: ['MappingAttribute', 'BooleanAttribute'],
  AttributeValue: ['String:String', 'Number:Number'],
  Matcher: ['NodeMatcher', 'NodeFlags', 'StringMatcher'],
  StringMatcher: ['String:String', 'Regex:Pattern'],
  TagType: ['Identifier', 'GlobalIdentifier'],
});

const grammar = class SpamexMiniparserGrammar {
  // @Cover
  Matcher(p) {
    if (p.match(/<(?:[*#@][ \t]*)?(?:\w|$)/y)) {
      p.eatProduction('NodeMatcher');
    } else if (p.match(/['"]/y)) {
      p.eatProduction('String:String');
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
      flags = p.eatProduction('NodeFlags', { path: 'flags' });
      p.eatMatchTrivia(_);
    }

    p.eatProduction('TagType', { path: 'type' });

    let sp = p.eatMatchTrivia(_);

    if (flags?.properties.syntacticFlag) {
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

  // @Node
  NodeFlags(p) {
    let sf = p.eatMatch('*', PN, { path: 'syntacticFlag' });
    if (!sf) p.eatMatch('#', PN, { path: 'commentFlag' });

    p.eatMatch('@', PN, { path: 'escapeFlag' });
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
      p.eatProduction('String:String');
    } else if (p.match(/-|\d/y)) {
      p.eatProduction('Number:Number');
    }
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

  // @Node
  Identifier(p) {
    p.eatLiteral(/\w+/y);
  }
};

module.exports = { name, dependencies, covers, grammar };
