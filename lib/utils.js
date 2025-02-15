import isArray from 'iter-tools/methods/is-array';
import isString from 'iter-tools/methods/is-string';

const { getPrototypeOf } = Object;

const isRegex = (val) => val instanceof RegExp;

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
