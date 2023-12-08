const every = require('iter-tools-es/methods/every');
const isArray = require('iter-tools-es/methods/is-array');
const isString = require('iter-tools-es/methods/is-string');

const { hasOwn, getPrototypeOf, getOwnPropertySymbols } = Object;
const isSymbol = (value) => typeof value === 'symbol';
const isType = (value) => isString(value) || isSymbol(value);
const isRegex = (val) => val instanceof RegExp;

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

const set = (obj, path, value) => {
  const { pathIsArray, pathName } = path;

  if (!pathName) {
    throw new Error();
  }

  if (pathIsArray) {
    if (!obj[pathName]) {
      obj[pathName] = [];
    }

    if (!isArray(obj[pathName])) throw new Error('bad array value');

    obj[pathName].push(value);
  } else {
    if (hasOwn(obj, pathName)) {
      throw new Error('duplicate child name');
    }
    obj[pathName] = value;
  }
};

const resolveDependentLanguage = (language, name) => {
  if (name === undefined) {
    return language;
  }

  const resolved = name === language.name ? language : language.dependencies[name];

  if (!resolved) {
    throw new Error(`Cannot resolve {name: ${name}} from {name: ${language.name}}`);
  }

  return resolved;
};

const buildNode = (id, children, properties = {}, attributes = {}) => {
  const { language, type } = id;
  return { language, type, children, properties, attributes, gap: undefined };
};

const buildId = (value) => {
  if (isString(value)) {
    const { 0: language, 1: type } = value.split(':');
    return type ? { language, type } : { language: undefined, type: language };
  } else {
    return value;
  }
};

const id = (...args) => {
  return buildId(String.raw(...args));
};

module.exports = {
  buildCovers,
  set,
  resolveDependentLanguage,
  isArray,
  isRegex,
  getPrototypeOf,
  buildNode,
  buildId,
  id,
};
