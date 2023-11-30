const Regex = require('./regex.js');
const StringLanguage = require('./string.js');
const Number = require('./number.js');
const { buildCovers } = require('../utils.js');
const sym = require('../symbols.js');

const _ = /\s+/y;
const PN = 'Punctuator';
const ID = 'Identifier';
const LIT = 'Literal';

const name = 'CSTML';

const dependencies = { Regex, String: StringLanguage, Number };

const covers = buildCovers({
  [sym.node]: ['Attribute', 'Property', 'TagType', 'Node', 'OpenNodeTag', 'CloseNodeTag'],
  [sym.fragment]: ['Attributes'],
  Attribute: ['MappingAttribute', 'BooleanAttribute'],
  AttributeValue: ['String:String', 'Number:Number'],
  TagType: ['Identifier', 'GlobalIdentifier'],
});

const grammar = class CSTMLMiniparserGrammar {
  Fragment(p) {
    p.eatMatchTrivia(_);
    while (p.match(/<[^/]/y) || p.atExpression) {
      p.eatProduction('Property', { path: 'properties[]' });
      p.eatMatchTrivia(_);
    }
  }

  // @Node
  Property(p) {
    p.eat(/\w+/y, ID, { path: 'key' });
    p.eatMatchTrivia(_);
    p.eat(':', PN, { path: 'mapOperator' });
    p.eatMatchTrivia(_);
    p.eatProduction('Node', { path: 'value' });
  }

  // @Node
  Node(p) {
    p.eatProduction('OpenNodeTag', { path: 'open' });
    p.eatProduction('Fragment');
    p.eatProduction('CloseNodeTag', { path: 'close' });
  }

  // @Node
  OpenNodeTag(p) {
    p.eat('<', PN, { path: 'open', startSpan: 'Tag', balanced: '>' });
    p.eatProduction('TagType', { path: 'type' });

    let sp = p.eatMatchTrivia(_);

    if ((sp && p.match(/\w+/y)) || p.atExpression) {
      p.eatProduction('Attributes');
      sp = p.eatMatchTrivia(_);
    }

    p.eatMatchTrivia(_);
    p.eat('>', PN, { path: 'close', endSpan: 'Tag', balancer: true });
  }

  // @Node
  CloseNodeTag(p) {
    p.eat('</', PN, { path: 'open', startSpan: 'Tag', balanced: '>' });

    p.eat('>', PN, { path: 'close', endSpan: 'Tag', balancer: true });
  }

  // @Fragment
  Attributes(p) {
    let sp = true;
    while (sp && (p.match(/\w+/y) || p.atExpression)) {
      if (p.atExpression) {
        p.eatProduction('Attributes'); // ??
      } else {
        p.eatProduction('Attribute', { path: 'attributes[]' });
      }
      if (p.match(/\s+\w/y) || (p.match(/\s+$/y) && !p.quasisDone)) {
        sp = p.eatMatchTrivia(_);
      } else {
        sp = false;
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
    p.eat(/\w+/y, ID, { path: 'key' });
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

  // @Node
  Identifier(p) {
    p.eatLiteral(/\w+/y);
  }
};

module.exports = { name, dependencies, covers, grammar };
