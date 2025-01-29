import isArray from 'iter-tools/methods/is-array';
import isString from 'iter-tools/methods/is-string';
import * as btree from '@bablr/agast-helpers/btree';

const { hasOwn, getPrototypeOf } = Object;

const isRegex = (val) => val instanceof RegExp;

export const get = (node, path) => {
  const { type, properties } = node;
  const { 1: name, 2: index } = /^([^\.]+)(?:\.(\d+))?/.exec(path) || [];

  if (!hasOwn(properties, name)) {
    throw new Error(`Cannot find {name: ${name}} on node of {type: ${type}}`);
  }

  if (index != null) {
    return properties[name]?.[parseInt(index, 10)];
  } else {
    return properties[name];
  }
};

export const add = (obj, ref, value) => {
  const { name, isArray: pathIsArray } = ref.value;
  if (pathIsArray) {
    if (!obj[name]) {
      obj[name] = [];
    } else if (!isArray(obj[name])) {
      throw new Error('bad array value');
    } else {
      obj[name] = btree.push(obj[name], { reference: ref, node: value });
    }
  } else {
    if (hasOwn(obj, name)) {
      throw new Error('duplicate child name');
    }
    obj[name] = { reference: ref, node: value };
  }
};

export const set = (obj, path, value) => {
  const { isArray: pathIsArray, name } = path;

  if (!name) {
    throw new Error();
  }

  if (pathIsArray) {
    if (!obj[name]) {
      obj[name] = [];
    }

    if (!isArray(obj[name])) throw new Error('bad array value');

    obj[name].push(value);
  } else {
    if (hasOwn(obj, name)) {
      throw new Error('duplicate child name');
    }

    obj[name] = value;
  }
};

export const buildNode = (id, children, properties = {}, attributes = {}) => {
  const { language, type } = id;
  return { language, type, children, properties, attributes, gap: undefined };
};

export const buildId = (value) => {
  if (isString(value)) {
    const { 0: language, 1: type } = value.split(':');
    return type ? { language, type } : { language: undefined, type: language };
  } else {
    return value;
  }
};

export const id = (...args) => {
  return buildId(String.raw(...args));
};

export const resolveDependentLanguage = (language, name) => {
  if (name === undefined) {
    return language;
  }

  const resolved = name === language.name ? language : language.dependencies[name];

  if (!resolved) {
    throw new Error(`Cannot resolve {name: ${name}} from {name: ${language.name}}`);
  }

  return resolved;
};

export { isArray, isRegex, getPrototypeOf };
