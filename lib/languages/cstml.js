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
  [sym.node]: [
    'Attribute',
    'Property',
    'TagType',
    'Node',
    'OpenFragmentNodeTag',
    'TerminalNodeShorthandTag',
    'OpenNodeTag',
    'CloseNodeTag',
    'Terminal',
  ],
  [sym.fragment]: ['Attributes', 'Fragment'],
  Attribute: ['MappingAttribute', 'BooleanAttribute'],
  AttributeValue: ['String:String', 'Number:Number'],
  TagType: ['Identifier', 'GlobalIdentifier'],
  Terminal: ['Literal', 'Trivia', 'Escape'],
  EmbeddedTerminal: ['Literal', 'Escape'],
});

const grammar = class CSTMLMiniparserGrammar {
  Fragment(p) {
    p.eatMatchTrivia(_);
    p.eatProduction('OpenFragmentNodeTag', { path: 'open' });
    p.eatProduction('FragmentChildren');
    p.eatProduction('CloseNodeTag', { path: 'close' });
    p.eatMatchTrivia(_);
  }

  FragmentChildren(p) {
    p.eatMatchTrivia(_);
    while (p.match(/#['"]|\w/y) || p.atExpression) {
      if (p.match(/#['"]/y)) {
        p.eatProduction('Trivia', { path: 'children[]' });
      } else {
        p.eatProduction('Property', { path: 'children[]' });
      }
      p.eatMatchTrivia(_);
    }
  }

  // @Node
  Node(p) {
    const openType = p.match('<|') ? 'TerminalNodeShorthandTag' : 'OpenNodeTag';
    const childrenType = openType === 'OpenNodeTag' ? 'NodeChildren' : 'TerminalNodeChildren';

    if (p.match('<>')) throw new Error('Fragment is not a node');

    const open = p.eatProduction(openType, { path: 'open' });
    if (!open.attributes.selfClosing) {
      p.eatProduction(childrenType);
      p.eatProduction('CloseNodeTag', { path: 'close' });
    }
  }

  NodeChildren(p) {
    let properties = 0;

    p.eatMatchTrivia(_);
    while (p.match(/#['"]|\w/y) || p.atExpression) {
      if (p.match(/#['"]/y)) {
        p.eatProduction('Trivia', { path: 'children[]' });
      } else {
        p.eatProduction('Property', { path: 'children[]' });
        properties++;
      }
      p.eatMatchTrivia(_);
    }

    if (!properties) throw new Error('Nodes must match text');
  }

  TerminalNodeChildren(p) {
    let properties = 0;

    p.eatMatchTrivia(_);
    while (p.match(/[!#]?['"]|\w/y) || p.atExpression) {
      if (p.match(/[!#]?['"]/y)) {
        p.eatProduction('Terminal', { path: 'children[]' });
      } else {
        p.eatProduction('Property', { path: 'children[]' });
        properties++;
      }
      p.eatMatchTrivia(_);
    }

    if (!properties) throw new Error('Nodes must match text');
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
  OpenFragmentNodeTag(p) {
    p.eat('<', PN, { path: 'open', startSpan: 'Tag', balanced: '>' });
    p.eat('>', PN, { path: 'close', endSpan: 'Tag', balancer: true });
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
  TerminalNodeShorthandTag(p) {
    p.eat('<|', PN, { path: 'open', startSpan: 'Tag', balanced: '>' });
    p.eatMatchTrivia(_);
    p.eatProduction('TagType', { path: 'type' });

    let sp = p.eatMatchTrivia(_);

    let value;
    if (sp && p.match(/['"/]/y)) {
      value = p.eatProduction('EmbeddedTerminal', { path: 'value' });
      sp = p.eatMatchTrivia(_);
    }

    if ((sp && p.match(/\w+/y)) || p.atExpression) {
      p.eatProduction('Attributes');
      sp = p.eatMatchTrivia(_);
    }

    p.eatMatchTrivia(_);
    p.eat('|>', PN, { path: 'close', endSpan: 'Tag', balancer: true });
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

  // @Cover
  Terminal(p) {
    if (p.match(/!['"]/y)) {
      p.eatProduction('Escape');
    } else if (p.match(/#['"]/y)) {
      p.eatProduction('Trivia');
    } else if (p.match(/['"]/y)) {
      p.eatProduction('Literal');
    } else {
      throw new Error();
    }
  }

  // @Cover
  EmbeddedTerminal(p) {
    if (p.match(/!['"]/y)) {
      p.eatProduction('Escape');
    } else if (p.match(/['"]/y)) {
      p.eatProduction('Literal');
    } else {
      throw new Error();
    }
  }

  // @Node
  Escape(p) {
    p.eat('!', PN, { path: 'escapeOperator' });
    p.eatProduction('String:String', { path: 'rawValue' });
    p.eatMatchTrivia(_);
    p.eat(':', PN, { path: 'rawOperator' });
    p.eatProduction('String:String', { path: 'value' });
  }

  // @Node
  Trivia(p) {
    p.eat('#', PN, { path: 'trivializeOperator' });
    p.eatProduction('String:String', { path: 'value' });
  }

  // @Node
  Literal(p) {
    p.eatProduction('String:String', { path: 'value' });
  }
};

module.exports = { name, dependencies, covers, grammar };
