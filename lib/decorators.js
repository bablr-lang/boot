import * as sym from './symbols.js';

export const CoveredBy = (type) => (desc, context) => {
  context.addInitializer(function () {
    let aliases = this.aliases;

    if (!aliases) {
      aliases = this.aliases = new Map();
    }

    let typeAliases = aliases.get(type);

    if (!typeAliases) {
      typeAliases = new Set();
      aliases.set(type, typeAliases);
    }

    typeAliases.add(desc.name);
  });
};

export const Node = (desc, context) => {
  return CoveredBy(sym.node)(desc, context);
};

export const Token = (desc, context) => {
  return CoveredBy(sym.token)(desc, context);
};
