const Regex = require('./regex.js');
const StringLanguage = require('./string.js');
const { buildCovers } = require('../utils.js');
const sym = require('../symbols.js');

const _ = /\s+/y;
const PN = 'Punctuator';
const ID = 'Identifier';

const name = 'CSTML';

const dependencies = { Regex, String: StringLanguage };

const covers = buildCovers({
  [sym.node]: ['Attribute', 'Path', 'TagType', 'Node', 'OpenNodeTag', 'CloseNodeTag'],
  [sym.fragment]: ['Attributes'],
  Attribute: ['StringAttribute', 'BooleanAttribute'],
  TagType: ['Identifier', 'GlobalIdentifier'],
});

const grammar = class CSTMLMiniparserGrammar {
  Fragment(p) {
    p.eatMatchTrivia(_);
    while (p.match(/<[^/]/y) || p.atExpression) {
      p.eatProduction('Node', { path: 'nodes' });
      p.eatMatchTrivia(_);
    }
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

    if (sp && p.match('.')) {
      p.eat('.', PN, { path: 'pathKeyword' });
      p.eatProduction('Identifier', { path: 'path' });
      sp = p.eatMatchTrivia(_);
    }

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
        p.eatProduction('Attribute', { path: '[attributes]' });
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
      p.eatProduction('StringAttribute');
    } else {
      p.eatProduction('BooleanAttribute');
    }
  }

  // @Node
  BooleanAttribute(p) {
    p.eat(/\w+/y, ID, { path: 'key' });
  }

  // @Node
  StringAttribute(p) {
    p.eat(/\w+/y, ID, { path: 'key' });
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

  // @Node
  Identifier(p) {
    p.eatLiteral(/\w+/y);
  }
};

module.exports = { name, dependencies, covers, grammar };
