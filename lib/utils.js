const every = require('iter-tools-es/methods/every');
const isArray = require('iter-tools-es/methods/is-array');
const isString = require('iter-tools-es/methods/is-string');

const { hasOwn, getOwnPropertySymbols } = Object;
const isSymbol = (value) => typeof value === 'symbol';
const isType = (value) => isString(value) || isSymbol(value);

const objectEntries = (obj) => {
  return {
    *[Symbol.iterator]() {
      for (let key in obj) if (hasOwn(obj, key)) yield [key, obj[key]];
      const symTypes = getOwnPropertySymbols(obj);
      for (const type of symTypes) {
        yield [type, obj[type]];
      }
    },
  };
};

const explodeSubtypes = (aliases, exploded, types) => {
  for (const type of types) {
    const explodedTypes = aliases.get(type);
    if (explodedTypes) {
      for (const explodedType of explodedTypes) {
        exploded.add(explodedType);
        const subtypes = aliases.get(explodedType);
        if (subtypes) {
          explodeSubtypes(aliases, exploded, subtypes);
        }
      }
    }
  }
};

const buildCovers = (rawAliases) => {
  const aliases = new Map();

  for (const alias of objectEntries(rawAliases)) {
    if (!isType(alias[0])) throw new Error('alias[0] key must be a string or symbol');
    if (!isArray(alias[1])) throw new Error('alias[1] must be an array');
    if (!every(isType, alias[1])) throw new Error('alias[1] values must be strings or symbols');

    aliases.set(alias[0], new Set(alias[1]));
  }

  for (const [type, types] of aliases.entries()) {
    explodeSubtypes(aliases, aliases.get(type), types);
  }

  return new Map(aliases);
};

const stripPathBraces = (str) => /\[\s*(\w+)\s*\]/.exec(str.trim())?.[1];

const resolveDependentLanguage = (language, name) => {
  const resolved = name === language.name ? language : language.dependencies.get(name);

  if (!resolved) {
    throw new Error(`Cannot resolve {name: ${name}} from {name: ${language.name}}`);
  }

  return resolved;
};

module.exports = { buildCovers, stripPathBraces, resolveDependentLanguage };
