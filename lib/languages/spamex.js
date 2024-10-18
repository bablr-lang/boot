const Regex = require('./regex.js');
const CSTML = require('./cstml.js');
const { buildCovers } = require('../utils.js');
const sym = require('@bablr/boot-helpers/symbols');

const _ = /\s+/y;
const PN = 'Punctuator';
const ID = 'Identifier';

const name = 'Spamex';

const canonicalURL = 'https://bablr.org/languages/core/en/spamex';

const dependencies = { CSTML, Regex };

const covers = buildCovers({
  [sym.node]: [
    'Attribute',
    'Identifier',
    'Matcher',
    'OpenNodeMatcher',
    'CloseNodeMatcher',
    'Literal',
    'CSTML:Flags',
  ],
  Attribute: ['MappingAttribute', 'BooleanAttribute'],
  AttributeValue: ['CSTML:String', 'CSTML:Number'],
  Matcher: ['NodeMatcher', 'StringMatcher'],
  StringMatcher: ['CSTML:String', 'Regex:Pattern'],
});

const grammar = class SpamexMiniparserGrammar {
  // @Cover
  Matcher(p) {
    if (p.match(/<[^!/]/y)) {
      p.eatProduction('NodeMatcher');
    } else if (p.match(/['"]/y)) {
      p.eatProduction('CSTML:String');
    } else if (p.match('/')) {
      p.eatProduction('Regex:Pattern');
    } else {
      throw new Error(`Unexpected character ${p.chr}`);
    }
  }

  NodeMatcher(p) {
    let open = p.eatProduction('OpenNodeMatcher', { path: 'open' });

    if (!open.properties.selfClosingTagToken) {
      p.eatMatchTrivia(_);

      if (open.properties.flags?.token) {
        // p.eatProduction('NodeChild', { path: 'children[]' }, { token: true });
        // p.eatMatchTrivia(_);
      } else {
        // while (!(p.match('</') || p.done)) {
        //   p.eatProduction('NodeChild', { path: 'children[]' });
        //   p.eatMatchTrivia(_);
        // }
      }

      p.eatProduction('CloseNodeMatcher', { path: 'close' });
    }
  }

  // @Node
  OpenNodeMatcher(p) {
    p.eat('<', PN, { path: 'openToken', startSpan: 'Tag', balanced: '>' });

    if (!p.atExpression) {
      p.eatProduction('CSTML:Flags', { path: 'flags' });
    }

    if (p.match(/['"]|[a-zA-Z]+:/y)) {
      p.eatProduction('CSTML:TagType', { path: 'type' });
    } else if (p.match('?')) {
      p.eat('?', PN, { path: 'type' });
    } else if (p.match(' ')) {
      p.eatMatchTrivia(_);
    } else {
      if (p.atExpression) {
        p.eatProduction('Identifier', { path: 'type' });
      } else {
        p.eatMatch(/[a-zA-Z]+/y, ID, { path: 'type' });
      }
    }

    let sp = p.eatMatchTrivia(_);

    if (sp && ((p.match(/['"/]/y) && !p.match('/>')) || p.atExpression)) {
      p.eatProduction('StringMatcher', { path: 'intrinsicValue' });

      sp = p.eatMatchTrivia(_);
    }

    if ((sp && p.match(/[a-zA-Z]+/y)) || p.atExpression) {
      p.eatProduction('Attributes', { path: 'attributes[]' });
      sp = p.eatMatchTrivia(_);
    }

    p.eatMatchTrivia(_);
    p.eatMatch('/', PN, { path: 'selfClosingTagToken' });
    p.eat('>', PN, { path: 'closeToken', endSpan: 'Tag', balancer: true });
  }

  CloseNodeMatcher(p) {
    p.eat('</', PN, { path: 'openToken', startSpan: 'Tag', balanced: '>' });
    p.eat('>', PN, { path: 'closeToken', endSpan: 'Tag', balancer: true });
  }

  Attributes(p) {
    let sp = true;
    while (sp && (p.match(/[a-zA-Z]+/y) || p.atExpression)) {
      p.eatProduction('Attribute');
      if (p.match(/\s+[a-zA-Z]/y)) {
        sp = p.eatMatchTrivia(_);
      }
    }
  }

  // @Cover
  Attribute(p) {
    if (p.match(/[a-zA-Z]+\s*=/y)) {
      p.eatProduction('MappingAttribute');
    } else {
      p.eatProduction('BooleanAttribute');
    }
  }

  // @Node
  BooleanAttribute(p) {
    p.eat(/[a-zA-Z]+/y, ID, { path: 'key' });
  }

  // @Node
  MappingAttribute(p) {
    p.eat(/[a-zA-Z]+/y, ID, { path: 'key' });
    p.eatMatchTrivia(_);
    p.eat('=', PN, { path: 'mapToken' });
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
    p.eatLiteral(/[a-zA-Z]+/y);
  }
};

module.exports = { name, canonicalURL, dependencies, covers, grammar };
